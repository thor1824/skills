---
name: subagent-improver-leanest
description: "Improve OpenAI/Codex custom subagents by invoking `subagent_reviewer`, applying targeted fixes for critical and major findings, evaluating minor findings, and repeating the review-fix-review loop until the subagent passes. Use when asked to fix, improve, adapt, or run an improvement loop for a custom subagent."
---

# Subagent Improver

## Purpose

Run a reviewer-driven improvement loop for a target OpenAI/Codex custom subagent.

`subagent_reviewer` performs read-only review. This skill applies targeted fixes and re-runs the reviewer until the target subagent passes or only intentionally skipped minor findings remain.

Default to OpenAI/Codex custom-subagent compatibility unless the user specifies another target runtime.

## Reviewer Dependency

Invoke the installed `subagent_reviewer` subagent directly.

Do not inspect, install, configure, or verify the reviewer. If invocation fails, stop and report:

```text
Blocked: the subagent_reviewer subagent is not available.
```

Do not perform a manual review unless the user explicitly asks for it.

## Inputs

The target may be a custom-agent TOML file, pasted subagent content, zip archive, directory, or diff.

If the target is unclear, inspect the workspace for likely custom-agent TOML files before asking for clarification.

For pasted content, return revised content or a patch instead of claiming files changed.

For diffs, focus on changed areas unless the reviewer identifies critical or major issues elsewhere.

For zips or directories, inspect the structure first. If multiple subagents are present, ask which one to improve.

## Loop

Run at most 3 review-fix cycles.

Each cycle:

1. Invoke `subagent_reviewer` with the target input, target runtime, and review mode.
2. Fix critical findings first.
3. Fix major findings next.
4. Evaluate minor findings individually.
5. Re-run `subagent_reviewer` after edits.

Use `standard` review by default. Use `diff` for diffs, `migration` for runtime adaptation, `strict` for release/shared subagents, and `quick` only when requested.

Stop when the reviewer returns `Pass` or when no critical or major findings remain and all remaining minor findings are intentionally skipped with reasons.

If critical or major findings remain after 3 cycles, stop and report remaining blockers and attempted fixes.

## Fix Policy

Make the smallest useful change that resolves the finding.

Always fix critical and major findings unless blocked by missing required input.

Fix minor findings only when they materially improve triggerability, execution quality, clarity, or maintainability. Skip subjective, low-value, unnecessary, or likely false-positive minor findings and record why.

Preserve the subagent's intended purpose, useful behavior, and required runtime-specific behavior.

Remove unsupported runtime assumptions unless the user explicitly wants that runtime.

## Compatibility Rules

For OpenAI/Codex custom subagents, preserve the required TOML fields:

- `name`
- `description`
- `developer_instructions`

Keep the `description` focused on when to use the subagent.

Keep `developer_instructions` focused on what the subagent must do, what it must not do, how it should handle inputs, and what output it should return.

Avoid unsupported fields, hooks, slash commands, undeclared tools, background-work assumptions, and Claude Code-specific behavior unless the target runtime explicitly requires them.

## Completion Output

End with:

- Files changed, revised content, or patch returned
- Critical findings fixed
- Major findings fixed
- Minor findings fixed or skipped
- Final reviewer verdict
- Remaining blockers, if any
