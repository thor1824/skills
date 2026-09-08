---
name: setup-agent-workspace
description: Prepare or reconcile a Git repository's AWSO overlay, Backlog.md board, and Matt Pocock engineering-skill configuration. Do not use for ordinary AWSO, Backlog.md, or tracker operations.
---

# Set Up Agent Workspace

Create one canonical setup: AWSO owns the overlay, which holds Backlog.md and Matt Pocock engineering-skill configuration. Agent instructions live in AWSO's `AGENTS.extend.md` source.

Run fully automatically. Do not ask for confirmation or pause for draft review.

## Hard boundaries

- Require a Git main worktree, working `awso` and `backlog` CLIs, and installed skills named `setup-matt-pocock-skills` and `triage`. Resolve skills by name regardless of path or version; never install them.
- Ignore `CLAUDE.md` completely.
- Support only root `backlog.config.yml`; its configured board directory may have any safe AWSO-relative name.
- Die on linked worktrees, tracked Backlog paths, dirty relevant tracked instructions, foreign symlinks, conflicting copies, unsafe paths, or ambiguous ownership.
- On failure, stop without rollback and report completed and partial mutations. Resume only recognizable, conflict-free state.

Invocation instructions may override only Backlog `project_name`, the five triage mappings, extra labels or types, and context layout. They cannot override safety, layout, tracker, or AWSO ownership.

## Run

Before acting, read and follow [references/setup-workflow.md](references/setup-workflow.md) completely. When directed, read [references/issue-tracker-backlog-md.md](references/issue-tracker-backlog-md.md) and load `setup-matt-pocock-skills`. Report success only after every verification passes.
