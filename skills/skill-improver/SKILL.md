---
name: skill-improver
description: "Iteratively improve OpenAI/Codex-compatible skills by invoking the installed `skill_reviewer` subagent, fixing critical and major findings, evaluating minor findings, and repeating the review-fix-review loop until the skill passes. Use when asked to fix a skill, improve skill quality, adapt a skill for another agent/runtime, or run an automated skill improvement loop."
---

# Skill Improver

## Purpose

Improve a target skill by orchestrating a review-fix-review loop.

This skill is the fixer and loop controller. It invokes the installed `skill_reviewer` subagent, applies targeted fixes based on the review, then invokes the reviewer again until the target skill passes or only intentionally skipped minor issues remain.

Be strict on loadability and compatibility, practical on execution quality, and restrained on style.

## Prerequisite

The `skill_reviewer` subagent must already be installed and available in the current agent environment.

Do not inspect, install, configure, or verify the reviewer subagent. Attempt to invoke it directly. If invocation fails, stop and report:

```text
Blocked: the skill_reviewer subagent is not available.
```

Do not fall back to a manual review unless the user explicitly asks for that behavior.

## Roles

The `skill_reviewer` subagent is responsible for read-only review of the target skill.

The reviewer must not edit files.

The `skill-improver` is responsible for:

- Invoking the reviewer
- Reading the reviewer findings
- Fixing critical and major issues
- Evaluating minor issues
- Re-invoking the reviewer after fixes
- Repeating until the reviewer returns `Pass` or only intentionally skipped minor issues remain
- Reporting changed files, remaining blockers, and skipped minor issues

## Inputs

The user may provide:

- A path to a skill directory
- A path to a `SKILL.md`
- Pasted skill content
- A zip archive containing a skill
- A diff of proposed skill changes
- A request such as:
  - "fix this skill"
  - "improve this skill"
  - "make this skill agent-compatible"
  - "adapt this skill for another runtime"
  - "run the skill improvement loop"

If the target skill is unclear, inspect the current workspace for likely skill directories before asking for clarification.

If the target runtime is not specified, default to OpenAI/Codex compatibility.

## Input Handling

### Skill directory or `SKILL.md`

Edit the target files directly when the workspace is writable.

Preserve the user's intended runtime and workflow unless the user asks to make the skill more portable.

### Pasted skill content

If no writable file is available, return revised content or a patch instead of claiming files were changed.

When returning revised content, include the complete revised `SKILL.md` unless the user asked for a diff only.

### Diff

When the input is a diff, focus edits on changed areas and regressions introduced by the diff.

Do not rewrite unrelated parts of the skill unless the reviewer identifies a critical or major issue outside the diff.

### Zip archive

Inspect the archive structure before editing.

If the archive contains no `SKILL.md`, treat that as a critical blocker.

If the archive contains multiple `SKILL.md` files, stop and ask which skill to improve.

If the archive contains exactly one skill and artifact editing is available, unpack it, improve it, and return an updated archive.

## Review Modes

Default to standard review unless the user requests or clearly implies another mode.

Use:

- `quick` review when the user asks for a fast pass
- `standard` review for normal improvement loops
- `strict` review for release-quality, shared, or production skills
- `diff` review when the input is a proposed patch or diff
- `migration` review when adapting from Claude Code, another runtime, or runtime-specific assumptions

## Reviewer Invocation Contract

Invoke the installed `skill_reviewer` subagent against the target skill.

Pass the reviewer:

- Target input: skill directory, `SKILL.md`, pasted content, archive, or diff
- Target runtime: user-specified runtime, or OpenAI/Codex if unspecified
- Review mode: quick, standard, strict, diff, or migration
- Constraint: read-only review; do not edit files
- Expected output: verdict, compatibility matrix, critical findings, major findings, minor findings, and not-verified checks

Do not inspect local subagent paths.

Do not install or configure the subagent.

Do not verify subagent availability before invocation.

If invocation fails, stop and report:

```text
Blocked: the skill_reviewer subagent is not available.
```

## Core Loop

Run at most 3 review-fix cycles by default.

Stop earlier if the reviewer returns `Pass` or if only intentionally skipped minor issues remain.

### 1. Locate the target skill

Identify the target skill directory, `SKILL.md`, pasted skill content, archive, or diff.

Preserve the user's intended target runtime and workflow unless the user asks to make the skill more portable.

### 2. Invoke the reviewer

Invoke the installed `skill_reviewer` subagent using the reviewer invocation contract.

Do not perform reviewer installation checks.

Do not fall back to a manual review unless the user explicitly asks for manual fallback behavior.

### 3. Read the review

Read the reviewer verdict and categorized findings.

Treat critical and major issues as required fixes.

Treat minor issues as optional and evaluate each one before changing anything.

### 4. Fix critical issues

Fix critical issues first.

Prioritize issues that block skill loading, parsing, discovery, reference resolution, or execution.

If a critical issue cannot be fixed because required input is missing, report the blocker clearly.

### 5. Fix major issues

Fix all major issues after critical issues are resolved.

Prefer targeted edits over broad rewrites.

Preserve existing useful behavior and the user's intended workflow.

### 6. Evaluate minor issues

Fix minor issues only when they clearly improve triggerability, execution quality, clarity, or maintainability.

Skip minor issues that are subjective, unnecessary, low-value, or likely false positives.

Track skipped minor issues and why they were skipped.

### 7. Re-run the reviewer

Invoke the `skill_reviewer` subagent again after edits.

Continue the loop while critical or major issues remain, up to the default 3-cycle limit.

Do not mark the skill complete until the reviewer returns `Pass` or only intentionally skipped minor issues remain.

### 8. Stop after repeated unresolved findings

If critical or major issues remain after 3 review-fix cycles, stop and report:

- Remaining critical or major findings
- Fixes already attempted
- Why the loop did not converge
- What input or decision is needed to continue

Do not continue indefinitely.

## Critical Issues

Always fix critical issues unless blocked by missing required input.

Critical issues are issues that block loading, discovery, parsing, reference resolution, or execution.

Examples:

- Missing `SKILL.md`
- Missing required frontmatter
- Invalid YAML frontmatter
- Missing `name`
- Missing `description`
- Malformed frontmatter delimiters
- Skill cannot load
- Target skill cannot be located
- Required referenced files or scripts are missing
- Required instructions depend on unavailable tools, plugins, hooks, commands, agents, or external services
- Core workflow depends on a runtime capability unavailable in the target runtime

## Major Issues

Fix all major issues before completion.

Major issues significantly reduce trigger reliability, execution quality, maintainability, or compatibility, but do not necessarily block loading.

Examples:

- Trigger description is vague or incomplete
- Description does not say when the skill should be used
- Workflow depends on unclear or undeclared environment-specific mechanics
- Instructions are written for the user instead of the acting agent
- Completion criteria are missing or unclear
- Workflow is too vague to execute reliably
- Required validation is missing
- `SKILL.md` is too long and should move detailed material into references
- Referenced scripts or files exist but are not documented clearly
- References exist but do not support the workflow
- The skill mixes unrelated workflows
- Optional or conditional dependencies are unclear, undeclared, or misleading

## Minor Issues

Evaluate minor issues individually before fixing.

Minor issues are non-blocking problems that affect clarity, polish, organization, or maintainability.

Examples:

- Formatting inconsistencies
- Slight verbosity
- Optional examples
- Minor naming improvements
- Non-blocking organization improvements
- Subjective style preferences

Do not automatically apply every minor suggestion. Fix only those that materially improve the skill.

## Agent Compatibility Rules

When improving a skill for broader agent compatibility:

- Remove assumptions about a specific agent runtime unless the skill explicitly targets that runtime.
- Replace runtime-specific commands, plugins, hooks, or slash commands with direct workflow instructions when they are not part of the target runtime.
- Preserve runtime-specific instructions only when clearly required by the target skill.
- Keep machine-readable completion markers only when the target workflow explicitly requires them.
- Prefer direct imperative instructions over model-specific phrasing such as "Claude should," "Codex should," or "the assistant should."
- Avoid unsupported frontmatter fields unless the target skill runtime documents them.
- Preserve the underlying workflow intent while removing unnecessary environment-specific mechanics.
- Do not broaden the skill beyond the user's requested runtime or portability goal.

## Editing Rules

Make the smallest useful change that resolves the reviewed issue.

Prefer:

- Targeted edits over broad rewrites
- Clear trigger descriptions over generic descriptions
- Direct workflow instructions over abstract advice
- Required references over duplicated long instructions
- Explicit completion criteria over vague quality statements

Preserve:

- The skill's intended purpose
- Existing correct behavior
- Useful examples
- Runtime-specific behavior that is intentionally required
- User-provided constraints

Avoid:

- Adding unnecessary frameworks
- Adding optional sections that do not improve execution
- Rewriting for style alone
- Expanding the skill into unrelated workflows
- Hiding unresolved reviewer findings

## Required Verification Pass

After applying edits and before completion, re-run the `skill_reviewer` subagent.

Check that the reviewer report says either:

- `Pass`, or
- only minor issues remain and each remaining minor issue has been intentionally skipped with a reason

Do not substitute a manual checklist for the reviewer unless the user explicitly asks for manual fallback behavior.

## Completion Criteria

The loop is complete when:

- The reviewer returns `Pass`, or
- No critical issues remain, no major issues remain, and remaining minor issues have been evaluated and intentionally skipped

Do not complete when:

- Any critical issue remains unresolved
- Any major issue remains unresolved
- The skill has not been re-reviewed after edits
- The target skill cannot be located
- Required user-provided files are missing
- The reviewer subagent cannot be invoked
- The review-fix loop reached the cycle limit with unresolved critical or major findings

## Completion Output

End with a concise report containing:

1. Files changed, revised content, or patch returned
2. Critical issues fixed
3. Major issues fixed
4. Minor issues fixed or skipped
5. Reviewer verdict
6. Remaining blockers, if any

For pasted content with no writable file, report:

```text
Files changed: none; revised content returned.
```

Only output the following marker when the surrounding workflow explicitly requires a machine-readable stop signal:

```text
<skill-improvement-complete>
```

## Rationalizations to Reject

- "It is probably fine" — rely on the reviewer pass.
- "The reviewer is optional" — this skill depends on the installed `skill_reviewer` subagent.
- "Minor issues can all be ignored" — evaluate each one.
- "The description is good enough" — the description must clearly trigger the skill.
- "Broken references are harmless" — broken references cause execution failures.
- "I can mark it complete before re-reviewing" — always re-run the reviewer after fixes.
- "One more loop will probably fix it" — stop after the cycle limit and report unresolved blockers.
- "The setup should be handled here" — subagent installation and configuration are out of scope.
