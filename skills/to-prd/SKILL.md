---
name: to-prd
description: Turn the current conversation context into a PRD draft, get maintainer approval, and then publish it to the project issue tracker. Use when user wants to create a PRD from the current context.
---

# To PRD

This skill takes the current conversation context and codebase understanding and produces a PRD. Do not interview the user for new product requirements; synthesize what you already know. The only allowed checkpoint is to confirm the module boundaries you inferred and which modules the maintainer wants tests for.

Before publishing, read `docs/agents/issue-tracker.md` to learn the repo's tracker contract. If it exists, also use `docs/agents/domain.md` for repo vocabulary and layout guidance. If `docs/agents/issue-tracker.md` is missing, you may still draft and revise the PRD in chat, but stop before writing any tracker file. Tell the user the tracker contract is missing and ask them to provide the target tracker format and location explicitly.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching. If `docs/agents/domain.md` exists, follow its terminology and layout guidance.

2. Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these inferred modules match their expectations and which of those modules they want tests written for. Do not use this checkpoint to solicit new requirements or redesign the feature.

3. Write the PRD using the template below, then present the full draft in chat and wait for explicit approval before writing any file.

4. If the maintainer requests changes, revise the draft in chat and ask again. Only publish the PRD to the project issue tracker after explicit approval, following the tracker contract in `docs/agents/issue-tracker.md`.

5. When you publish the approved PRD, use the minimal YAML front matter shown below. Do not add `status`, `category`, or `blocked_by` when creating a new PRD. A PRD may receive `status: done` or `status: wontfix` later if the maintainer explicitly closes it.

<prd-template>

---
type: PRD
---

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be comprehensive but bounded, covering the primary flows, key edge cases, operational concerns, and explicit non-goals where relevant.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
