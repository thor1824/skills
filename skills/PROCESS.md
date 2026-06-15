# Skill Process Map

This repo defines a local Markdown issue process for TSDA engineering skills.

## Normal flow

1. `/prepare-repo`
   - Bootstraps repo-specific contracts in `AGENTS.md` and `docs/agents/`.
   - Defines where local issues live, which front matter `status` values are valid for issues, and how domain docs are read.

2. `/grill-with-docs` when intent, domain language, or decisions are fuzzy
   - Stress-tests the plan against `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, and code.
   - Updates `CONTEXT.md` and ADRs lazily as terminology and durable decisions crystallize.
   - Produces established facts, open questions, and acceptance/scope notes for downstream skills.

3. `/to-prd`
   - Turns current conversation and repo understanding into a PRD draft, presents it for approval in chat, and only then writes `.scratch/<feature-slug>/PRD.md`.
   - Emits minimal YAML front matter with `type: PRD`. A PRD may later receive `status: done` or `status: wontfix` only when explicitly closed.

4. `/to-issues`
   - Breaks a PRD or plan into independently-grabbable vertical slices.
   - Publishes implementation issues at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
   - Emits YAML front matter with `type: Issue`, `blocked_by`, and the tracker value mapped from canonical `needs-triage` so each issue enters triage.

5. `/triage`
   - Reads local Markdown PRDs and issues, assigns or verifies the front matter fields relevant to each item type.
   - For `type: PRD`, does not manage approval or intermediate workflow states; it may only close a PRD as `done` or `wontfix` on explicit maintainer direction.
   - For `type: Issue`, canonical `ready-for-human` means the issue needs human implementation rather than AFK agent work.
   - Runs `/grill-with-docs` when an issue needs more domain, scope, or acceptance detail.
   - Moves issues through `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `in-progress`, `done`, and `wontfix`.
   - Writes agent briefs when an issue becomes `ready-for-agent`.
   - Writes `.out-of-scope/` records when an enhancement is rejected as `wontfix`.

6. `???`

## Shared contracts

- Tracker contract: `docs/agents/issue-tracker.md`
- Status mapping: `docs/agents/triage-labels.md`
- Domain-doc rules: `docs/agents/domain.md`
- Local issue root: `.scratch/`
- Rejected enhancement memory: `.out-of-scope/`

## Handoff rule

Each producer skill must emit the fields the next consumer needs. In practice:

- Any new implementation issue entering triage should include front matter `type` and the `status` value mapped from canonical `needs-triage`.
- Any implementation issue already classifiable should include exactly one front matter `category` value.
- Any implementation issue with dependencies should include front matter `blocked_by`; use `blocked_by: []` for unblocked items.
- A PRD written by `/to-prd` is already approved. Open PRDs have no `status`; closed PRDs use only `status: done` or `status: wontfix`.
- `ready-for-human` means "human action required" for implementation issues only.
- `ready-for-agent` means the mapped tracker `status` for canonical `ready-for-agent` plus a latest `## Agent Brief` with concrete acceptance criteria.
- Anything resolved by `/grill-with-docs` should survive as `CONTEXT.md` terms, ADRs, issue comments, PRD text, or agent brief material.
- Anything delegated to an AFK agent should include an agent brief with current behavior, desired behavior, key interfaces, acceptance criteria, and out-of-scope notes.
