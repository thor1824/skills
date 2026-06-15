# Worker Contract

This file defines the required behavior for any future dedicated issue-manager worker agent. It is the stable contract. `WORKER-PROMPT.md` is only the current v1 implementation prompt for a generic subagent.

## Inputs

The worker must receive these exact values:

- assigned issue path
- assigned worktree path
- assigned branch name
- assigned report file path

The worker must operate only inside the assigned worktree.

## Required behavior

1. Read the assigned issue file first.
2. Use the first `## Agent Brief` in that file as the authoritative specification.
3. Inspect the relevant code before implementing.
4. Make the smallest complete change needed to satisfy the issue brief.
5. Add or update tests when appropriate.
6. Run relevant checks that are actually available.
7. If relevant checks cannot be run, record them truthfully under `Checks Skipped` with the reason.
8. Update only the assigned issue file in the issue tracker. Do not change other issue or PRD files unless the assigned issue explicitly requires it.
9. Set the assigned issue file's front matter `status` to `done` before completion.
10. Write the required report file to the exact assigned report path.
11. Create git commit(s) for the implementation and issue-state update.
12. Leave the worktree completely clean at completion: `git status --porcelain` must be empty.

## Repository boundaries

- Work only in the assigned worktree.
- You may modify any repository files needed to complete the assigned issue.
- Do not modify unrelated issue or PRD files.
- Under `.agents/issue-manager/`, write only the assigned report file.
- Do not merge branches.
- Do not rewrite branch history.

## Failure behavior

If the assigned issue file is missing, malformed, or lacks an `## Agent Brief`:

- fail closed
- do not invent missing requirements
- do not set the issue to `done`
- write a brief failure note to the assigned report file if possible

If relevant checks are unavailable because tooling is missing or broken:

- run any relevant checks that are available
- record unavailable checks under `Checks Skipped` with the reason
- do not pretend the checks ran

## Required report shape

The report file must contain these sections every time:

- `Summary`
- `Files Changed`
- `Checks Run`
- `Checks Skipped`
- `Risks / Follow-up`
- `Issue Status Confirmation`

Section requirements:

- `Summary` should be brief and high-level.
- `Files Changed` must list concrete repo-relative paths, not prose.
- `Checks Skipped` must always appear. Use `None` when nothing was skipped.
- `Risks / Follow-up` must always appear. Use `None` when there are no residual concerns.
- `Issue Status Confirmation` must quote the exact resulting status value, for example `Set issue status to: done`.

## Completion signals

The manager may trust the worker on semantic completion, but any compliant worker should still leave these durable signals:

- the issue file is `status: done`
- the required report file exists at the assigned path
- the worker branch is committed and clean
