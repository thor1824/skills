---
name: orchestrate-prd
description: Drive one PRD to completion by repeatedly claiming ready-for-agent issues, creating worktrees, delegating each issue to the issue-implementer subagent, merging successful results, and marking the PRD done only after coverage review passes.
---

# Orchestrate PRD

Use this skill when the user wants one PRD implemented end-to-end through AFK issue delivery.

This skill assumes:
- The issue tracker is the local Markdown tracker under `.scratch/`
- The PRD already exists and has implementation issues
- Issues are triaged before orchestration
- AFK-eligible issues are identified by `status: ready-for-agent` plus a latest `## Agent Brief` with concrete acceptance criteria

If the repo-specific tracker docs are missing, run `/prepare-repo` first.

## Inputs

Require:
- One PRD path/reference
- One explicit base branch/ref

Optional:
- Concurrency limit

If the user does not provide a limit, default to `2`.

## Helper script

Use `skills/orchestrate-prd/scripts/orchestrate-prd.js` as the execution surface for tracker/worktree mechanics.

Primary commands:

```text
node skills/orchestrate-prd/scripts/orchestrate-prd.js find-ready --prd <PRD.md> --pretty
node skills/orchestrate-prd/scripts/orchestrate-prd.js create-worktrees --prd <PRD.md> --base <branch> --limit <N> --mark-in-progress --pretty
node skills/orchestrate-prd/scripts/orchestrate-prd.js write-report --issue <issue.md> --report .codex/orchestrate-prd/report.md --output-file <captured-output.md> --pretty
node skills/orchestrate-prd/scripts/orchestrate-prd.js merge-worktree --issue <issue.md> --report .codex/orchestrate-prd/report.md --delete-branch --pretty
node skills/orchestrate-prd/scripts/orchestrate-prd.js review-prd --prd <PRD.md> --pretty
node skills/orchestrate-prd/scripts/orchestrate-prd.js mark-done --prd <PRD.md> --pretty
```

## Runtime state

Persist ephemeral run state outside the issue files in one local runtime JSON file under the system temp directory.

The state file should contain at least:
- `prd_path`
- `base_ref`
- `limit`
- `active_workers`
- `issue_path`
- `branch`
- `worktree_path`
- `report_path`
- `worker_id`
- `status`
- `last_update`

Issue front matter remains the durable claim state. Do not duplicate long-lived tracker truth into the runtime file.

## Worker contract

For each claimed issue:
1. Start from the created worktree path as the subagent cwd.
2. Launch the `issue-implementer` subagent against the issue path.
3. Pass only the issue reference and normal repo instructions. Do not ask the subagent to manage status transitions, comments, commits, or cleanup.
4. Capture the subagent’s final output exactly.

The subagent must follow [subagents/issue-implementer.md](../../subagents/issue-implementer.md).

If subagent launch capability is unavailable in the current environment, stop and report `BLOCKED` rather than simulating completion.

## Loop

Run a long-lived orchestration loop for one PRD:

1. Read the PRD and current issue set.
2. Find ready issues.
3. Launch up to the concurrency limit.
4. Wait for any active worker to finish.
5. On worker completion:
   - Persist its captured output to a temporary file if needed
   - Materialize the canonical report into the worktree with `write-report`
   - Merge with `merge-worktree`
6. Refresh the PRD issue state.
7. Launch more ready issues if capacity is available.
8. Repeat until no more progress is possible.

Always pass the explicit base branch/ref when creating new worktrees. Do not rely on the script default `HEAD`.

## Outcome handling

Treat worker results as follows:

- `PASS`: write the canonical report, merge the worktree, delete the branch, keep looping
- `FAIL`: write the canonical report, stop automation for that issue, and surface it for human follow-up
- `BLOCKED`: write the canonical report, allow the helper script to move the issue to `needs-info`, and keep looping on unrelated issues

Treat merge outcomes as follows:

- Merge success: continue
- Merge conflict: surface it and let the helper script move the issue to `needs-info`
- Other merge failure: surface it for human follow-up and stop automation for that issue

Do not rerun the same failed or blocked worker automatically.

## Completion gate

When all issues under the PRD are terminal:
1. Run `review-prd --prd <PRD.md> --pretty`
2. Confirm there are no non-terminal issues
3. Confirm the review reports no uncovered PRD user stories
4. Only then run `mark-done --prd <PRD.md> --pretty`

If the coverage review reports gaps, do not mark the PRD done. Surface the missing coverage explicitly.

## Reporting back to the user

Your final response should summarize:
- Which issues were launched
- Which issues merged
- Which issues ended `needs-info` or human-follow-up
- Whether the PRD was marked done
- Any remaining coverage gaps or orchestration blockers
