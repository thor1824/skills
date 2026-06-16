---
name: grill-with-docs
description: Grilling session for plans that need repo terminology and decision records checked or updated. Use when the user wants to stress-test a plan against the project's domain language, `CONTEXT.md`, ADRs, or equivalent domain documentation, especially when the outcome should update repo docs or produce a structured final handoff the user can turn into docs later.
---

# Grill with docs

Use this skill when repo terminology or architectural decision records are part of the work.

If the user only wants a generic design interrogation with no documentation alignment, use the same questioning style but skip the doc-specific workflow in this skill: do not inspect `CONTEXT.md`/ADRs, do not propose doc edits, and end with a concise design-only handoff.

Focus on the highest-impact ambiguities, terminology conflicts, and decision points that block implementation, PRD writing, issue creation, or safe documentation updates. Do not try to exhaustively cover every possible branch.

Stop when any one of these is true:

- the blocking ambiguities have been resolved
- the remaining questions are lower-value than the current handoff
- the user wants to stop or switch tasks

Run the workflow in this order:

1. Interview: ask the next highest-value question.
2. Investigate: inspect code or docs only when needed to answer that question or check a claim.
3. Capture: update repo docs only when documentation edits are in scope; otherwise capture the result in a structured final handoff in your response.

Ask questions one at a time by default. If the user is working asynchronously or explicitly asks for a batch, provide a short prioritized set instead.

For each question:

- provide the question itself
- provide a recommended direction only when it can be justified from the code, existing docs, or an explicit trade-off you can explain
- do not invent domain answers that must come from the user or domain experts

If a question can be answered by exploring the codebase, explore the codebase first, then return to the grilling flow with either:

- the answer you found, or
- a sharper next question if the code does not settle it

Keep exploration bounded to the specific question you are trying to answer.

## Domain awareness

During codebase exploration, also look for existing documentation.

Start with the common conventions described below, but if the repo uses equivalent domain docs in different locations, use those instead of forcing new files into the convention.

### File structure

Most repos have a single context:

```text
/
|- CONTEXT.md
|- docs/
|  \- adr/
|     |- 0001-event-sourced-orders.md
|     \- 0002-postgres-for-write-model.md
\- src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. Repeated context-local `CONTEXT.md` files or multiple `docs/adr/` directories are also strong signals of a multi-context repo. A context map, when present, points to where each context lives:

```text
/
|- CONTEXT-MAP.md
|- docs/
|  \- adr/                          <- system-wide decisions
\- src/
   |- ordering/
   |  |- CONTEXT.md
   |  \- docs/adr/                  <- context-specific decisions
   \- billing/
      |- CONTEXT.md
      \- docs/adr/
```

Only create `CONTEXT.md` or `docs/adr/` when documentation edits are in scope for the current session and you have concrete content to write.

### Choose the right context

If `CONTEXT-MAP.md` exists, read it before updating domain docs.

If you are only grilling and not editing docs, you may infer the most likely context for discussion and say so explicitly. If multiple contexts are plausible, prefer the context that owns the core noun or aggregate being discussed; if no single owner is clear, ask.

If you are going to update `CONTEXT.md` or create an ADR, use this rule:

- when exactly one context is clearly implied by the topic and current docs, proceed
- otherwise, ask the user which context should own the terminology or decision before writing anything

Write system-wide ADRs in root `docs/adr/`. Write context-local ADRs in the context's own `docs/adr/`. Update the `CONTEXT.md` for the context whose language is being clarified.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y - which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' - do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible - which is right?"

### Update CONTEXT.md inline

When a term is resolved, decide whether to update docs now or defer:

- If the user explicitly wants repo docs updated, or the surrounding workflow clearly requires a repo doc change, update `CONTEXT.md` inline as terms are resolved.
- Otherwise, prefer the structured final handoff and defer file edits until the user asks for them.

Do not leave resolved terminology only in transient chat. Capture it either in `CONTEXT.md` or in the structured final handoff. Use the format in [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md).

Don't couple `CONTEXT.md` to implementation details. Only include terms that are meaningful to domain experts.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** - the cost of changing your mind later is meaningful
2. **Surprising without context** - a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** - there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](ADR-FORMAT.md).

### Leave a handoff

At the end of a grilling session, or before returning control to another workflow, summarize the output in a structured final handoff in your response unless the user asked you to write that handoff into a file.

Use these sections:

- **Established facts** - behavior, constraints, and scenarios now agreed
- **Resolved terminology** - terms added to or reconciled with `CONTEXT.md`
- **Non-ADR decisions** - choices useful to remember but not worth an ADR
- **Open questions** - specific unresolved questions that block PRD, issue, or agent readiness
- **Acceptance/scope notes** - criteria and boundaries useful for PRDs, triage notes, or agent briefs

If the surrounding workflow will feed an issue, PRD, triage note, or agent brief, make sure this handoff is easy to copy into that artifact.
