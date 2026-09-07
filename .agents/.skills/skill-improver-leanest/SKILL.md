---
name: skill-improver-leanest
description: "Improve OpenAI/Codex-compatible skills by invoking `skill_reviewer`, applying targeted fixes for critical and major findings, evaluating minor findings, and repeating the review-fix-review loop until the skill passes. Use when asked to fix, improve, adapt, or run an improvement loop for a skill."
---

# Skill Improver

## Purpose

Run a reviewer-driven improvement loop for a target skill.

`skill_reviewer` performs read-only review. This skill applies targeted fixes and re-runs the reviewer until the target skill passes or only intentionally skipped minor findings remain.

Default to OpenAI/Codex compatibility unless the user specifies another target runtime.

## Reviewer Dependency

Invoke the installed `skill_reviewer` subagent directly.

Do not inspect, install, configure, or verify the reviewer. If invocation fails, stop and report:

```text
Blocked: the skill_reviewer subagent is not available.
```

Do not perform a manual review unless the user explicitly asks for it.

## Inputs

The target may be a skill directory, `SKILL.md`, pasted content, zip archive, or diff.

If the target is unclear, inspect the workspace for likely skill directories before asking for clarification.

For pasted content, return revised content or a patch instead of claiming files changed.

For diffs, focus on changed areas unless the reviewer identifies critical or major issues elsewhere.

For zips, inspect the archive first. If multiple skills are present, ask which one to improve.

## Loop

Run at most 3 review-fix cycles.

Each cycle:

1. Invoke `skill_reviewer` with the target input, target runtime.
2. Fix critical findings first.
3. Fix major findings next.
4. Evaluate minor findings individually.
5. Re-run `skill_reviewer` after edits.

Stop when the reviewer returns `Pass` or when no critical or major findings remain and all remaining minor findings are intentionally skipped with reasons.

If critical or major findings remain after 3 cycles, stop and report remaining blockers and attempted fixes.

## Fix Policy

Make the smallest useful change that resolves the finding.

Always fix critical and major findings unless blocked by missing required input.

Fix minor findings only when they materially improve triggerability, execution quality, clarity, or maintainability. Skip subjective, low-value, unnecessary, or likely false-positive minor findings and record why.

Preserve the skill's intended purpose, useful behavior, and required runtime-specific behavior.

Remove unsupported runtime assumptions unless the user explicitly wants that runtime.

When fixing verbosity findings, reduce repetition and remove low-value examples or meta-frameworks. Preserve instructions that affect loadability, compatibility, execution order, stop conditions, or blocker handling.

## Completion Output

End with:

- Files changed, revised content, or patch returned
- Critical findings fixed
- Major findings fixed
- Minor findings fixed or skipped
- Final reviewer verdict
- Remaining blockers, if any
