# Skill Process Map

This repo defines a local Markdown issue process for TSDA engineering skills.

## Normal flow

1. `/setup-tsda-skills`
   - Bootstraps repo-specific contracts in `AGENTS.md` and `docs/agents/`.
   - Defines where local issues live, which front matter `status` values are valid, and how domain docs are read.

2. `/grill-with-docs` when intent, domain language, or decisions are fuzzy
   - Stress-tests the plan against `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, and code.
   - Updates `CONTEXT.md` and ADRs lazily as terminology and durable decisions crystallize.
   - Produces established facts, open questions, and acceptance/scope notes for downstream skills.

3. `/to-prd`
   - Turns current conversation and repo understanding into `.scratch/<feature-slug>/PRD.md`.
   - Emits YAML front matter with `type: PRD`, `category: enhancement`, `blocked_by: []`, and the tracker value mapped from canonical `needs-triage`, so the PRD can enter triage.

4. `/to-issues`
   - Breaks a PRD or plan into independently-grabbable vertical slices.
   - Publishes implementation issues at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
   - Emits YAML front matter with `type: Issue`, `blocked_by`, and the tracker value mapped from canonical `needs-triage` so each issue enters triage.

5. `/triage`
   - Reads local Markdown PRDs and issues, assigns or verifies front matter `type`, `category`, `status`, and `blocked_by`.
   - For `type: PRD`, approves PRDs for human issue slicing via `/to-issues` by moving them to canonical `ready-for-human`, or moves them to `needs-info`/`wontfix`.
   - For `type: Issue`, canonical `ready-for-human` means the issue needs human implementation rather than AFK agent work.
   - Runs `/grill-with-docs` when an issue needs more domain, scope, or acceptance detail.
   - Moves items through `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `in-progress`, `done`, and `wontfix`.
   - Writes agent briefs when an issue becomes `ready-for-agent`.
   - Writes `.out-of-scope/` records when an enhancement is rejected as `wontfix`.

6. Implementation skills
   - Consume the same domain docs and issue contracts.
   - They should use `CONTEXT.md`/`CONTEXT-MAP.md`, ADRs, and `docs/agents/*.md` before changing code.

## Shared contracts

- Tracker contract: `docs/agents/issue-tracker.md`
- Status mapping: `docs/agents/triage-labels.md`
- Domain-doc rules: `docs/agents/domain.md`
- Local issue root: `.scratch/`
- Rejected enhancement memory: `.out-of-scope/`

## Handoff rule

Each producer skill must emit the fields the next consumer needs. In practice:

- Anything triage should see must include front matter `type` and the `status` value mapped from canonical `needs-triage`.
- Anything already classifiable should include exactly one front matter `category` value.
- Anything with dependencies should include front matter `blocked_by`; use `blocked_by: []` for unblocked items.
- `ready-for-human` means "human action required"; PRDs use it for `/to-issues` approval, while implementation issues use it for human delivery.
- Anything resolved by `/grill-with-docs` should survive as `CONTEXT.md` terms, ADRs, issue comments, PRD text, or agent brief material.
- Anything delegated to an AFK agent should include an agent brief with current behavior, desired behavior, key interfaces, acceptance criteria, and out-of-scope notes.
