# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root
- `docs/adr/` for decisions that touch the area being changed

If any of these files don't exist, proceed silently. Don't flag their absence and don't suggest creating them upfront. `/grill-with-docs` creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```text
/
├── CONTEXT.md
├── docs/adr/
├── src/
└── test/
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Avoid drifting to synonyms if the glossary defines a preferred term.

If the concept you need is not in the glossary yet, either reconsider the wording or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface that explicitly instead of silently overriding it.
