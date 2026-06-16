---
name: issue-manager
description: Orchestrate ready local-markdown issues through deterministic claim, worker worktree preparation, worker completion, and serialized merge using an ESM Node manager plus the installed `issue_manager_worker` subagent. Requires `node`, `git`, `git worktree`, and Codex `multi_agent_v1.spawn_agent`/`wait_agent`/`close_agent` support. Use when the user wants to run the AFK implementation loop, inspect manager status, or inspect leftover manager artifacts.
disable-model-invocation: true
---

# Issue Manager

Run the deterministic issue-manager workflow for the repo's local markdown tracker.

This skill requires:

- `node` on `PATH`
- `git` on `PATH`
- `git worktree` support
- a Codex runtime that exposes synchronous `multi_agent_v1.spawn_agent`, `multi_agent_v1.wait_agent`, and `multi_agent_v1.close_agent`
- the installed `issue_manager_worker` subagent

This skill also assumes the `prepare-repo` skill has already established:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- `.gitignore` entries for `.worktrees/` and `.agents/issue-manager/`

If those repo prerequisites are missing, stop and tell the maintainer to run the `prepare-repo` skill first.

## Commands

Normalize the user's request to one of these internal subcommands:

- `run` - default when the maintainer asks to run the manager or does not specify a subcommand
- `status` - read-only orchestration summary
- `cleanup` - read-only alias of `status`, interpreted as a leftover-artifact summary with manual cleanup guidance

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
- `run` mutates the repo. Request approval when the active sandbox policy requires it.
- `status` and `cleanup` may be invoked without that approval because they are read-only.
- Do not bypass `manager.mjs` by reimplementing its orchestration logic in chat. The script is the source of truth for claim, prepare, complete, and merge transitions.

## Read-only flow

For `status` or `cleanup`:

`cleanup` uses the same script path and payload shape as `status`. The difference is presentation emphasis: summarize leftovers and recovery guidance first.

1. Run:

   ```sh
   node .\skills\issue-manager\manager.mjs <subcommand>
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

For `run`, act as the thin wrapper around `manager.mjs` and the installed `issue_manager_worker` subagent.

### 1. Claim or stop

Run:

```sh
node .\skills\issue-manager\manager.mjs run
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

### 2. Invoke the worker

Invoke the installed `issue_manager_worker` subagent with the Codex multi-agent tools:

1. Start the worker with `multi_agent_v1.spawn_agent` using:
   - `agent_type: "default"`
   - `fork_context: false`
   - a single `items` entry of type `skill` that points at `agents/issue-manager-worker.toml`
   - the minimal assignment prompt below as the initial `message`
2. Wait for completion with `multi_agent_v1.wait_agent`.
3. If the worker exceeds the timeout, close it with `multi_agent_v1.close_agent`.

Pass only the four assigned runtime values below. Do not add extra conversational context.

If `multi_agent_v1.spawn_agent` is unavailable, stop and report:

```text
Blocked: the issue_manager_worker subagent is not available.
```

If the current Codex runtime cannot wait for the worker with `multi_agent_v1.wait_agent`, stop and report:

```text
Blocked: the current Codex runtime cannot synchronously wait for issue_manager_worker completion.
```

Use a minimal prompt that passes only the four assigned runtime values:

```text
Assigned issue path: <issue path>
Assigned worktree path: <worktree path>
Assigned branch name: <branch name>
Assigned report file path: <report file path>
```

### 3. Wait policy

- Wait for the worker to finish for up to 30 minutes with `multi_agent_v1.wait_agent`.
- Only continue after the worker has definitely exited.
- If the wait times out, close the worker with `multi_agent_v1.close_agent`, then continue only after the close call confirms the worker is no longer running.
- If the runtime cannot prove the worker has exited, stop as blocked and do not run `complete`.
- If the worker exits with failure or is interrupted after it has definitely exited, still continue to Step 4 exactly once. The repo state remains the authoritative completion check.

### 4. Complete the claimed issue

Always run exactly one completion pass after the worker ends:

```sh
node .\skills\issue-manager\manager.mjs complete --issue-path <claimed issue path>
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
