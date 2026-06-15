# Codex Issue Manager Plan

## Purpose

Build a lightweight issue-manager workflow around Codex where a manager process coordinates ready issues, creates isolated Git worktrees, delegates implementation to Codex-powered workers, and merges completed work back into the main tree.

Codex is best used as the implementation worker. The manager loop should be deterministic and handled by a small script, CLI, or automation layer that owns orchestration, state transitions, worktree creation, merge handling, and retries.

## High-Level Architecture

The workflow has two roles:

1. **Issue Manager**
   - Coordinates the full run.
   - Finds issues that are ready for agent work.
   - Creates isolated worktrees and branches.
   - Starts one worker per issue.
   - Tracks completion.
   - Merges completed work back into the main tree.
   - Repeats until no unblocked ready issues remain.

2. **Issue Implementation Worker**
   - Runs inside one assigned worktree.
   - Reads the assigned issue brief from the repository.
   - Implements the requested change.
   - Runs relevant checks and tests.
   - Commits its work.
   - Marks the issue as done according to the repository's existing issue conventions.
   - Reports back with summary, tests, and risks.

## Issue Manager Workflow

### 1. Check Repository State

Before starting, the manager checks whether the current Git tree is dirty.

If the tree has uncommitted changes, the manager asks whether to:

- Commit everything before starting, or
- Stash everything before starting.

This keeps the orchestration run reproducible and avoids accidentally mixing unrelated user changes with agent-generated work.

### 2. Discover Ready Issues

The manager finds all issues that are currently ready for agent work according to the repository's existing issue conventions.

It should only select issues that:

- Are marked ready for agent work.
- Have no unresolved blocking issue.
- Are not already in progress.
- Are not already completed.

After each merge, the manager should discover ready issues again, because completing one issue may unblock others.

### 3. Create an Isolated Worktree Per Issue

For each selected issue, the manager creates a dedicated Git worktree and branch.

Suggested branch naming convention:

```text
agent/<issue-name-or-id>
```

Each worker should operate only inside its own worktree. This allows several independent issues to be implemented in parallel without interfering with each other.

### 4. Mark Issue as In Progress

Before starting a worker, the manager marks the issue as in progress according to the repository's existing issue conventions.

The manager should own this transition to avoid multiple workers claiming the same issue.

### 5. Start a Codex Worker

The manager starts a Codex-powered worker in the issue's dedicated worktree.

The worker receives a focused prompt containing:

- The assigned issue reference.
- The rule that it must work only inside its assigned worktree.
- The instruction to read the issue brief from the repository.
- The instruction to implement the smallest complete change.
- The instruction to run relevant checks and tests.
- The instruction to commit its work.
- The instruction to mark the issue as done using the repository's existing conventions.
- The instruction to report summary, tests, and risks.

Example worker prompt:

```text
You are implementing one isolated issue.

Rules:
- Work only in this worktree.
- Read the assigned issue brief first.
- Make the smallest complete change.
- Run relevant checks and tests.
- Commit all code changes.
- Mark the issue done using the repository's existing issue conventions.
- Report summary, tests run, and remaining risks.
- Do not merge branches.
- Do not modify unrelated issues unless the assigned issue explicitly requires it.
```

### 6. Wait for Worker Completion

The manager waits for each worker to finish.

Completion can be detected by one or more of the following:

- The worker process exits successfully.
- The issue is marked done according to repository conventions.
- The worker branch contains a final implementation commit.
- The worker writes a completion report.

The manager should treat worker failure as non-fatal for the full run. Failed issues should be reported and left for manual review or retry.

### 7. Merge Completed Work

When a worker finishes successfully, the manager merges the worker branch back into the main tree.

The manager should:

- Validate that the worker committed its work.
- Optionally run checks before merging.
- Merge the branch.
- Run relevant checks after merging.
- Commit any issue-state updates required by the repository conventions.

If a merge conflict occurs, the manager should stop that merge and report the conflict clearly. Conflict resolution may be handled manually or delegated to Codex with explicit instructions.

### 8. Repeat Until Complete

After each successful merge, the manager repeats discovery of ready issues.

This allows newly unblocked issues to be picked up automatically.

The run ends when there are no remaining ready, unblocked issues.

## Worker Responsibilities

Each Codex worker is responsible for exactly one issue.

The worker should:

1. Read the assigned issue brief.
2. Understand the expected behavior and constraints.
3. Inspect the relevant code.
4. Implement the requested change.
5. Add or update tests where appropriate.
6. Run relevant checks.
7. Commit the completed implementation.
8. Mark the issue done using existing repository conventions.
9. Report back with:
   - Summary of changes.
   - Tests/checks run.
   - Any skipped checks.
   - Risks or follow-up notes.

The worker should not:

- Merge its own branch.
- Modify unrelated issue state.
- Start work on additional issues.
- Coordinate other workers.
- Change the orchestration rules.

## Recommended Separation of Responsibilities

Codex should handle implementation work.

The manager script should handle orchestration:

- Git dirty-state checks.
- Commit-or-stash setup.
- Ready-issue discovery.
- Blocking/dependency evaluation.
- Worktree creation.
- Branch naming.
- Worker startup.
- Worker monitoring.
- Merge sequencing.
- Conflict detection.
- Final run summary.

This separation keeps the system predictable. Codex can focus on coding, while deterministic repository operations stay under the manager's control.

## Concurrency Model

The manager can run workers in parallel when issues are independent.

Recommended defaults:

- Start with a small concurrency limit.
- Avoid running issues in parallel if they touch the same subsystem heavily.
- Merge completed work one branch at a time.
- Re-run ready-issue discovery after each merge.

Parallel implementation is useful, but merging should remain serialized to keep conflict handling simple.

## Failure Handling

The manager should handle failures explicitly.

Common failure cases:

- Worker exits without committing.
- Worker cannot complete the issue.
- Tests fail.
- Merge conflict occurs.
- Issue state was not updated correctly.
- The worktree becomes dirty after a failed run.

Recommended behavior:

- Do not silently continue after a failed merge.
- Do not mark failed issues as done.
- Keep failed worktrees available for inspection.
- Include failed issues in the final summary.
- Allow rerunning failed issues after manual cleanup or additional instructions.

## Final Output

At the end of a manager run, produce a summary containing:

- Issues completed.
- Issues skipped.
- Issues failed.
- Branches merged.
- Checks run.
- Known risks.
- Suggested PR title.
- Suggested PR description.

Example PR title:

```text
Implement ready agent issues for <prd-or-feature-name>
```

Example PR description:

```markdown
## Summary

- Implemented ready agent issues for <prd-or-feature-name>.
- Merged completed worker branches into the main tree.
- Left failed or blocked issues for follow-up.

## Completed Issues

- <issue 1>
- <issue 2>

## Checks

- <check command>
- <check command>

## Notes

- <risk or follow-up note>
```

## Key Design Principle

Use Codex as the coding agent, not as the sole source of orchestration truth.

The manager should be boring, deterministic, and conservative. Workers can be flexible and intelligent inside isolated worktrees, but the manager should control when work starts, when state changes, and when code is merged.
