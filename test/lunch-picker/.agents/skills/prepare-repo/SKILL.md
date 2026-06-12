---
name: prepare-repo
description: Sets up an `## Agent skills` block in `AGENTS.md` and `docs/agents/` so the engineering skills know this repo's local markdown issue tracker, triage status vocabulary, and domain doc layout.
disable-model-invocation: true
---

# Prepare Repo

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — where issues live local Markdown
- **Triage statuses** — the front matter strings used for the seven canonical issue states
- **Domain docs** — where `CONTEXT.md` and ADRs live, how `/grill-with-docs` produces them, and how consumer skills read them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `AGENTS.md` at the repo root — does it exist? Is there already an `## Agent skills` section?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/` — does this skill's prior output already exist?
- `.scratch/` — sign that a local-markdown issue tracker convention is already in use

### 2. Present findings and ask

Summarize what's present and what's missing. Then walk the user through the three decisions **one at a time** — present a section, get the user's answer, then move to the next. Don't dump all three at once.

Assume the user does not know what these terms mean. Each section starts with a short explainer (what it is, why these skills need it, what changes if they pick differently). Then show the choices and the default.

**Section A — Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. In this setup, those issues are local markdown files under `.scratch/`. Skills like `to-issues`, `triage`, and `to-prd` need the repo's file layout and naming rules so they can create, read, and update those files consistently.

Confirm the local markdown convention:

- **Feature directory** — issues live under `.scratch/<feature-slug>/`
- **PRD location** — the PRD lives at `.scratch/<feature-slug>/PRD.md`
- **Issue location** — implementation issues live at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- **Naming** — derive slugs from titles using lowercase kebab-case; reuse an existing feature directory only when continuing that feature; otherwise append `-2`, `-3`, etc.; issue numbers increment from the highest existing `NN`
- **Front matter** — PRDs and implementation issues start with YAML front matter
- **Type field** — PRDs use `type: PRD`; implementation issues use `type: Issue`
- **Status field** — triage state is recorded as `status` in the issue file, not in a remote tracker
- **Category field** — when known, issue category is recorded as `category: bug` or `category: enhancement`
- **Blocked field** — blockers are recorded as a `blocked_by` list; `blocked_by: []` means unblocked

**Section B — Triage status vocabulary.**

> Explainer: When a skill processes an issue, it writes a `status` value into the markdown issue file front matter. In this repo, Section B defines the allowed issue-state strings for that field, covering both triage and delivery progress. If your repo already uses different status strings (e.g. `triage-needed` instead of `needs-triage`), map them here so the skill writes the right values instead of inventing new ones.

The seven canonical issue states:

- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter
- `ready-for-agent` — fully specified, AFK-ready (an agent can pick it up with no human context)
- `ready-for-human` — requires human action; for PRDs, approved for `/to-issues`; for issues, needs human implementation
- `in-progress` — implementation is underway
- `done` — implementation is complete
- `wontfix` — will not be actioned

Default: each canonical status string equals its name. Ask the user if they want to override any. If they do not already use custom `status` values in issue front matter, the defaults are fine.

**Section C — Domain docs.**

> Explainer: `/grill-with-docs` updates `CONTEXT.md` and `docs/adr/` lazily when terminology or durable decisions are resolved. Other skills (`to-prd`, `to-issues`, `triage`, `improve-codebase-architecture`, `diagnose`, `tdd`) read those files to use the project's domain language and respect past architectural decisions. They need to know whether the repo has one global context or multiple (e.g. a monorepo with separate frontend/backend contexts) so they look in the right place.

Confirm the layout:

- **Single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root. Most repos are this.
- **Multi-context** — `CONTEXT-MAP.md` at the root pointing to per-context `CONTEXT.md` files (typically a monorepo).

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to `AGENTS.md`
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- If `AGENTS.md` exists, edit it.
- If it does not exist, create `AGENTS.md`.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage statuses

[one-line summary of the triage status vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Then write the three docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-local.md](issue-tracker-local.md) — local-markdown issue tracker
- [triage-labels.md](triage-labels.md) — status mapping
- [domain.md](domain.md) — domain doc consumer rules + layout

### 5. Done

Tell the user the setup is complete, that `/grill-with-docs` will produce domain docs lazily, and which engineering skills will now read from these files. Mention they can edit `docs/agents/*.md` directly later — re-running this skill is only necessary if they want to change the local markdown conventions or restart from scratch.
