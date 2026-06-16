---
name: skill-improver-lean
description: "Improve OpenAI/Codex-compatible skills by invoking the installed `skill_reviewer` subagent, applying targeted fixes for critical and major findings, evaluating minor findings, and re-running the reviewer until the skill passes. Use when asked to fix, improve, adapt, or run a review-fix-review loop for a skill."
---

# Skill Improver

## Purpose

Improve a target skill through a reviewer-driven fix loop.

This skill is the fixer and loop controller. The installed `skill_reviewer` subagent performs read-only review. This skill applies targeted edits, then re-runs the reviewer until the target skill passes or only intentionally skipped minor issues remain.

Be strict on loadability and compatibility, practical on execution quality, and restrained on style.

## Prerequisite

The `skill_reviewer` subagent must already be installed and available.

Do not inspect, install, configure, or verify the reviewer subagent. Invoke it directly. If invocation fails, stop and report:

```text
Blocked: the skill_reviewer subagent is not available.
```

Do not perform a manual fallback review unless the user explicitly asks for it.

## Inputs

The user may provide a skill directory, `SKILL.md`, pasted skill content, zip archive, diff, or a request such as "fix this skill", "improve this skill", "adapt this skill", or "run the skill improvement loop".

If the target skill is unclear, inspect the current workspace for likely skill directories before asking for clarification.

If the target runtime is not specified, default to OpenAI/Codex compatibility.

## Input Handling

- Directory or `SKILL.md`: edit files directly when the workspace is writable.
- Pasted content: return revised content or a patch; do not claim files changed.
- Diff: focus on changed areas unless the reviewer identifies a critical or major issue elsewhere.
- Zip archive: inspect the archive first. If it has no `SKILL.md`, report a blocker. If it has multiple `SKILL.md` files, ask which skill to improve. If it has exactly one skill and artifact editing is available, unpack, improve, and return an updated archive.

## Reviewer Invocation

Invoke `skill_reviewer` with:

- Target input: path, pasted content, archive, or diff
- Target runtime: user-specified runtime, or OpenAI/Codex if unspecified
- Review mode: `standard` unless the user requested `quick`, `strict`, `diff`, or `migration`
- Constraint: read-only review; do not edit files
- Expected output: verdict plus critical, major, minor, and not-verified findings

Use `diff` mode for diffs, `migration` mode when adapting from another runtime, and `strict` mode for production or shared skills.

## Core Loop

Run at most 3 review-fix cycles by default.

For each cycle:

1. Invoke `skill_reviewer`.
2. Read the verdict and findings.
3. Fix critical findings first.
4. Fix major findings next.
5. Evaluate minor findings individually.
6. Re-run `skill_reviewer` after edits.

Stop early when the reviewer returns `Pass` or when only intentionally skipped minor issues remain.

If critical or major findings remain after 3 cycles, stop and report the remaining blockers, attempted fixes, and what is needed to continue.

## Fix Policy

Always fix critical and major findings unless blocked by missing required input.

Critical findings are issues that block loading, discovery, parsing, reference resolution, or execution.

Major findings are issues that significantly reduce trigger reliability, execution quality, maintainability, or compatibility.

Fix minor findings only when they materially improve triggerability, execution quality, clarity, or maintainability. Skip subjective, low-value, unnecessary, or likely false-positive minor findings, and record why each was skipped.

Make the smallest useful change that resolves the issue. Prefer targeted edits over broad rewrites. Preserve the skill's intended purpose, useful examples, correct behavior, and required runtime-specific behavior.

## Compatibility Rules

When improving for broader agent compatibility:

- Remove runtime-specific assumptions unless the skill explicitly targets that runtime.
- Replace unsupported commands, plugins, hooks, slash commands, or named-agent assumptions with direct workflow instructions.
- Preserve runtime-specific behavior only when required by the target workflow.
- Prefer direct imperative instructions over model-specific phrasing such as "Claude should", "Codex should", or "the assistant should".
- Avoid unsupported frontmatter fields unless the target runtime documents them.
- Do not broaden the skill beyond the user's requested runtime or portability goal.

## Completion Criteria

The loop is complete only when:

- The reviewer returns `Pass`, or
- No critical or major findings remain, and remaining minor findings have been intentionally skipped with reasons.

Do not complete if the reviewer could not be invoked, the target skill could not be located, required files are missing, critical or major findings remain, or the skill has not been re-reviewed after edits.

## Completion Output

End with a concise report:

1. Files changed, revised content, or patch returned
2. Critical findings fixed
3. Major findings fixed
4. Minor findings fixed or skipped
5. Final reviewer verdict
6. Remaining blockers, if any

For pasted content with no writable file, write:

```text
Files changed: none; revised content returned.
```

Only output this marker when the surrounding workflow explicitly requires a machine-readable stop signal:

```text
<skill-improvement-complete>
```
