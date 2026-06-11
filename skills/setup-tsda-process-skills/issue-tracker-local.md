# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- PRDs and implementation issues start with YAML front matter containing `type`, `status`, `category`, and `blocked_by`
- PRDs use `type: PRD`; implementation issues use `type: Issue`
- Issue state is recorded as the front matter `status` value (see `triage-labels.md` for the allowed status strings)
- When known, issue category is recorded as `category: bug` or `category: enhancement`
- Blockers are recorded as a front matter `blocked_by` list; use `blocked_by: []` when there are no blockers
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Naming rules

- Derive `<feature-slug>` from the feature or PRD title using lowercase kebab-case.
- Reuse an existing `.scratch/<feature-slug>/` directory when continuing the same feature.
- If the slug already exists for an unrelated feature, append `-2`, `-3`, etc. until the directory is unique.
- Derive issue file slugs from the issue title using lowercase kebab-case.
- Number implementation issues by incrementing the highest existing `NN` in `.scratch/<feature-slug>/issues/`, starting at `01`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed):

- PRD: `.scratch/<feature-slug>/PRD.md` with `type: PRD` in YAML front matter
- Implementation issue: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` with `type: Issue` in YAML front matter

If the item should enter triage, include a front matter `status` value using the tracker value mapped from the canonical state in `triage-labels.md`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## When a skill says "query the issue tracker"

Search `.scratch/**/*.md` and group items by their front matter `status` value. If dates are present, sort oldest first; otherwise use path order.

## When a skill says "post a comment" or "add a note"

Append the note under the issue file's `## Comments` heading. Create that heading if it does not exist.

## When a skill says "close" an issue

Set the issue front matter `status` to the closing state, usually `done` or `wontfix`.
