# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- PRDs and implementation issues start with YAML front matter, but they do not use the same fields
- PRDs use `type: PRD` when open, and may later add only `status: done` or `status: wontfix` when explicitly closed
- Implementation issues use `type: Issue`
- Implementation issue state is recorded as the front matter `status` value (see `triage-labels.md` for the allowed status strings)
- When known, implementation issue category is recorded as `category: bug` or `category: enhancement`
- Implementation issue blockers are recorded as a front matter `blocked_by` list; use `blocked_by: []` when there are no blockers
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Naming rules

- Derive `<feature-slug>` from the feature or PRD title using lowercase kebab-case.
- Reuse an existing `.scratch/<feature-slug>/` directory when continuing the same feature.
- If the slug already exists for an unrelated feature, append `-2`, `-3`, etc. until the directory is unique.
- Derive issue file slugs from the issue title using lowercase kebab-case.
- Number implementation issues by incrementing the highest existing `NN` in `.scratch/<feature-slug>/issues/`, starting at `01`.

## Issue-manager prerequisites

- `/issue-manager` assumes `/prepare-repo` has also updated `.gitignore` to ignore `.worktrees/` and `.agents/issue-manager/`.
- `.worktrees/` is reserved for manager-created git worktrees. Do not commit files from this directory.
- `.agents/issue-manager/` is reserved for worker reports and manager runtime artifacts. Do not commit files from this directory.
- Implementation issue blockers should be recorded as repo-relative issue paths in `blocked_by`, for example `.scratch/feature/issues/01-setup.md`.
- Any implementation issue sent to AFK execution should already satisfy the `ready-for-agent` contract: mapped `status`, exactly one `type`, exactly one `category`, an explicit `blocked_by` list, and an `## Agent Brief`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed):

- PRD: `.scratch/<feature-slug>/PRD.md` with `type: PRD` in YAML front matter
- Implementation issue: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` with `type: Issue` in YAML front matter

- New PRD: write only `type: PRD` in front matter. Do not add `status`, `category`, or `blocked_by` when creating it.
- New implementation issue entering triage: include a front matter `status` value using the tracker value mapped from the canonical state in `triage-labels.md`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## When a skill says "query the issue tracker"

Search `.scratch/**/*.md` and group implementation issues by their front matter `status` value. Treat PRDs with no `status` as open, approved PRDs rather than "missing status" triage items. If dates are present, sort oldest first; otherwise use path order.

## When a skill says "post a comment" or "add a note"

Append the note under the issue file's `## Comments` heading. Create that heading if it does not exist.

## When a skill says "close" an issue

Set the item front matter `status` to the closing state, usually `done` or `wontfix`. For PRDs, only do this on explicit maintainer direction.
