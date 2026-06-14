---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker and triage status vocabulary should have been provided to you - run `/prepare-repo` if not. Before writing any `status` value in issue front matter, read `docs/agents/triage-labels.md` and use the tracker value mapped from the canonical state name.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments. If the source is a PRD from the local tracker, expect `type: PRD` in YAML front matter; if it is still in triage, note that `/triage` should approve it for issue slicing by moving it to canonical `ready-for-slicing` first unless the maintainer explicitly overrides.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Delivery**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: the exact PRD story numbers this slice covers. Finalize these references before publishing.

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. Include YAML front matter with `type: Issue` and the tracker-specific `status` value mapped from canonical `needs-triage` so each issue enters the normal triage flow. Set `category` from the source material; default to `enhancement` for PRD or feature-plan slices.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the `blocked_by` front matter field.

<issue-template>
---
type: Issue
status: <tracker value for canonical needs-triage>
category: enhancement
blocked_by: []
---

## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## User stories covered

1. PRD story 1 - Short reference to the story this issue covers
2. PRD story 3 - Short reference if this slice covers another story

## Blocked by

- List the same blocking ticket refs as `blocked_by` if extra explanation is useful.

Or "None - can start immediately" if `blocked_by` is empty.

</issue-template>

For new issues, `## User stories covered` is required whenever the source PRD has numbered user stories. Use explicit `PRD story <N>` references so downstream orchestration can review coverage without inference.

Do NOT close or modify any parent issue.
