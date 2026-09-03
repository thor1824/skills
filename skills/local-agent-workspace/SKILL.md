---
name: local-agent-workspace
description: Set up ignored, repository-local instructions and Markdown issue management for local coding agents without changing tracked project files. Use when a user asks for a private or uncommitted agent workspace, local agent backlog, or per-clone agent instructions.
---

# Local Agent Workspace

Create a local agent workspace in the current Git repository without modifying
tracked project files.

## Target layout

```text
.agent/
|-- AGENTS.md
|-- issues/
|   `-- ISSUE-0001.md
`-- archive/
```

Do not create a root `AGENTS.override.md`; it can replace the repository's
tracked instructions at that directory level. Keep all local material under
`.agent/`.

## Setup

1. Resolve the repository root with `git rev-parse --show-toplevel`. Stop and
   explain if the current directory is not in a Git worktree.
2. Resolve the applicable local exclude file with
   `git rev-parse --git-path info/exclude`. Do not assume `.git` is a directory;
   linked worktrees may use a redirect file.
3. Ensure the exclude file contains the anchored pattern `/.agent/`. Preserve
   all existing content and avoid duplicate entries. Do not edit `.gitignore`.
4. Create `.agent/issues/` and `.agent/archive/` if absent.
5. If `.agent/AGENTS.md` is absent, create it from the template below. If it
   exists, preserve it unless the user explicitly requests an update.
6. Ensure the active global Codex instruction file contains the bootstrap block
   below. Use a non-empty `AGENTS.override.md` in the Codex home when it exists;
   otherwise use `AGENTS.md`. Preserve existing content and avoid duplicate
   marker blocks.
7. Verify with `git check-ignore -v .agent/AGENTS.md` and `git status --short`.
   Report the resolved exclude file and global instruction file.

Use `apply_patch` for file edits. Never overwrite an existing issue, global
instruction file, or exclude file wholesale.

## Local `.agent/AGENTS.md` template

````markdown
# Local Agent Workspace

This directory contains private, per-clone agent context and issue tracking.
It supplements all tracked repository instructions; it does not replace them.

## Issue management

- Active issues live in `.agent/issues/`; completed or abandoned issues move to
  `.agent/archive/`.
- Use one Markdown file per issue, named `ISSUE-NNNN-short-title.md`.
- Before starting substantial work, inspect active issues for relevant context.
- Update an issue when its status, scope, decisions, evidence, or next action
  materially changes.
- Never stage or commit files beneath `.agent/`.

## Issue format

Each issue starts with YAML frontmatter containing:

```yaml
---
id: ISSUE-0001
title: Short descriptive title
status: open
priority: medium
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Valid statuses are `open`, `in-progress`, `blocked`, and `done`. The body should
contain `Context`, `Acceptance criteria`, `Notes`, and `Next action` sections.
````

Do not create a sample issue unless the user asks for one; empty directories are
valid local state.

## Global bootstrap block

Append this exact marked block when it is not already present:

```markdown
<!-- local-agent-workspace:start -->
## Repository-local agent workspace

At the beginning of work in a Git repository, check for
`<repository-root>/.agent/AGENTS.md`. If present, read it after the normally
discovered repository instructions and treat it as additive local guidance.
Never stage or commit files beneath `<repository-root>/.agent/`.
<!-- local-agent-workspace:end -->
```

Codex builds its automatic instruction chain once per run. After first-time
setup, tell the user to start a new session so the new global bootstrap is
loaded automatically.

## Safety and scope

- Ignoring prevents ordinary staging but not an explicit `git add -f`; describe
  this accurately rather than promising absolute prevention.
- Do not modify tracked `AGENTS.md`, `.gitignore`, hooks, Git configuration, or
  files outside the active Codex home and target repository.
- If `.agent/` is already tracked, stop and report that ignoring cannot make
  tracked content local-only. Do not remove it from the index without explicit
  user authorization.
- If existing local conventions conflict with this template, preserve them and
  report the difference.
