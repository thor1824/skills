---
name: issue-manager
description: Orchestrate ready local-markdown issues through deterministic claim, worker worktree preparation, worker completion, and serialized merge using a PowerShell manager plus a Codex worker subagent. Use when the user wants to run the AFK implementation loop, inspect manager status, or inspect leftover manager artifacts.
disable-model-invocation: true
---

# Issue Manager

Run the deterministic issue-manager workflow for the repo's local markdown tracker.

This skill assumes `/prepare-repo` has already established:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- `.gitignore` entries for `.worktrees/` and `.agents/issue-manager/`

If those prerequisites are missing, stop and tell the maintainer to run `/prepare-repo` first.

## Commands

Normalize the user's request to one of these internal subcommands:

- `run` - default when the maintainer asks to run the manager or does not specify a subcommand
- `status` - read-only orchestration summary
- `cleanup` - read-only leftover-artifact summary with manual cleanup guidance

Natural-language examples that map to `run`:

- "run the issue manager"
- "pick up ready issues"
- "start the AFK implementation loop"

Examples that map to `status`:

- "show issue-manager status"
- "what is blocking the manager"

Examples that map to `cleanup`:

- "show me what to clean up"
- "inspect leftover issue-manager artifacts"

## Operational rules

- Run this skill from the repository root only.
- `run` is the only mutating path. `status` and `cleanup` are read-only.
- Because this repo's `AGENTS.md` requires approval for non-read-only PowerShell commands, request approval before invoking `manager.ps1 run`.
- `status` and `cleanup` may be invoked without that approval because they are read-only.
- Do not bypass `manager.ps1` by reimplementing its orchestration logic in chat. The script is the source of truth for claim, prepare, complete, and merge transitions.

## Read-only flow

For `status` or `cleanup`:

1. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\issue-manager\manager.ps1 <subcommand>
   ```

2. Parse the JSON result from stdout.
3. Present a concise summary:
   - eligible issues
   - blocked `ready-for-agent` issues
   - invalid `ready-for-agent` issues
   - `in-progress` issues
   - `ready-for-human` issues
   - managed branches/worktrees
   - "completed in worktree, not merged" leftovers
4. If managed artifacts are blocking future runs, surface the script's `manualRecovery` suggestions.

## Run flow

For `run`, act as the thin wrapper around `manager.ps1` and the worker subagent.

### 1. Claim or stop

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\issue-manager\manager.ps1 run
```

Interpret the JSON response:

- `idle` - report the preflight summary and stop successfully.
- `blocked` - report the blocking phase, `reasonCode`, and message. If the script suggests manual recovery, surface it. Proactively recommend `status` or `cleanup` when that would help. Stop.
- `claimed` - continue with worker execution.

When `claimed` is returned, report a concise preflight summary before launching the worker:

- eligible issue count
- blocked ready issue count
- invalid ready issue count
- existing `in-progress` issue count
- existing `ready-for-human` issue count
- claimed issue path

### 2. Render the worker prompt

Read the prompt template at the exact `promptTemplatePath` returned by `manager.ps1`.

Render it by replacing these placeholders:

- `{{ISSUE_PATH}}`
- `{{WORKTREE_PATH}}`
- `{{BRANCH_NAME}}`
- `{{REPORT_PATH}}`

Do not add extra conversational context. The worker should start with minimal fresh context and work from the issue plus the fixed contract.

### 3. Spawn the worker

Spawn a `default` subagent:

- `fork_context: false`
- one initial prompt only
- no follow-up messages

The worker prompt is the fully rendered `WORKER-PROMPT.md` template.

### 4. Wait policy

- Wait for the worker to finish for up to 30 minutes.
- If the worker times out, close the subagent.
- If the worker fails, is interrupted, or times out, still continue to Step 5 exactly once. The repo state remains the authoritative completion check.

### 5. Complete the claimed issue

Always run exactly one completion pass after the worker ends:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\issue-manager\manager.ps1 complete -IssuePath <claimed issue path>
```

Interpret the JSON response:

- `merged` - report the successful merge for that issue, then go back to Step 1 and run the loop again.
- `blocked` - report the failure phase, `reasonCode`, worker branch, worktree path, and any recovery guidance. Stop the full run.

## Output style

Keep operator-facing output concise and operational:

- For successful runs, list completed issues, skipped blocked/invalid/in-progress issues, and any remaining manual follow-up notes.
- For failures, report:
  - failed issue
  - failure phase
  - `reasonCode`
  - worker branch
  - worktree path
  - whether manual inspection is required

Do not hide the script's structured outcome behind prose.
