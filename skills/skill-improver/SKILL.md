---
name: skill-improver
description: "Iteratively improve skills by invoking an installed skill-reviewer subagent, fixing reported critical and major issues, evaluating minor issues, and repeating the review-fix-review loop until the skill passes. Use when asked to fix a skill, improve skill quality, adapt a skill for another agent/runtime, or run an automated skill improvement loop."
---

# Skill Improver

## Purpose

Improve a target skill by orchestrating a review-fix-review loop.

This skill is the fixer and loop controller. It invokes the installed `skill-reviewer` subagent, applies fixes based on the review, then invokes the reviewer again until the target skill passes or only intentionally skipped minor issues remain.

## Prerequisite

The `skill-reviewer` subagent must already be installed and available in the current agent environment.

Do not inspect, install, configure, or verify the reviewer subagent. If the reviewer subagent cannot be invoked, report that the improvement loop is blocked.

## Reviewer Role

The `skill-reviewer` subagent is responsible for reviewing the target skill and returning categorized findings.

The reviewer must not edit files.

The `skill-improver` is responsible for:

- Invoking the reviewer
- Reading the reviewer findings
- Fixing critical and major issues
- Evaluating minor issues
- Re-invoking the reviewer after fixes
- Repeating until the reviewer returns `Pass` or only intentionally skipped minor issues remain

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

## Core Loop

1. **Locate the target skill**
   - Identify the target skill directory, `SKILL.md`, pasted skill content, archive, or diff.
   - Preserve the user's intended target runtime and workflow unless the user asks to make the skill more portable.

2. **Invoke the reviewer**
   - Invoke the installed `skill-reviewer` subagent against the target skill.
   - Pass the target skill directory, `SKILL.md`, pasted content, archive, or diff as input.
   - Do not perform reviewer installation checks.
   - Do not fall back to a manual review unless the user explicitly asks for that behavior.

3. **Read the review**
   - Read the review verdict and categorized findings.
   - Treat critical and major issues as required fixes.
   - Treat minor issues as optional and evaluate each one before changing anything.

4. **Fix critical issues**
   - Fix critical issues first.
   - Prioritize issues that block skill loading, parsing, or execution.
   - If a critical issue cannot be fixed because required input is missing, report the blocker clearly.

5. **Fix major issues**
   - Fix all major issues after critical issues are resolved.
   - Prefer targeted edits over broad rewrites.
   - Preserve existing useful behavior and the user's intended workflow.

6. **Evaluate minor issues**
   - Fix minor issues only when they clearly improve triggerability, execution quality, clarity, or maintainability.
   - Skip minor issues that are subjective, unnecessary, low-value, or likely false positives.
   - Track skipped minor issues and why they were skipped.

7. **Re-run the reviewer**
   - Invoke the `skill-reviewer` subagent again after edits.
   - Continue the loop while critical or major issues remain.
   - Do not mark the skill complete until the reviewer returns `Pass` or only intentionally skipped minor issues remain.

8. **Report completion**
   - Summarize what changed.
   - Include remaining blockers, if any.
   - Mention skipped minor issues and the reason for skipping them.

## Reviewer Invocation

Invoke the installed `skill-reviewer` subagent against the target skill.

Do not inspect local subagent paths.

Do not install or configure the subagent.

Do not verify subagent availability before invocation.

If invocation fails, stop and report:

```text
Blocked: the skill-reviewer subagent is not available.
```

## Critical Issues

Always fix critical issues unless blocked by missing user input.

Critical issues include:

- Missing `SKILL.md`
- Missing required frontmatter
- Invalid YAML frontmatter
- Missing `name`
- Missing `description`
- Broken references to required files
- Instructions that depend on unavailable tools, plugins, hooks, commands, or agents
- Skill cannot load
- Target skill cannot be located

## Major Issues

Fix all major issues before completion.

Major issues include:

- Trigger description is vague or incomplete
- Description does not say when the skill should be used
- Workflow depends on environment-specific mechanics that are not part of the target runtime
- Instructions require unavailable commands, plugins, hooks, tools, or subagents
- Instructions are written for the user instead of the acting agent
- Completion criteria are missing or unclear
- Workflow is too vague to execute reliably
- `SKILL.md` is too long and should move details into references
- Referenced scripts or files are not documented clearly
- The skill mixes unrelated workflows

## Minor Issues

Evaluate minor issues individually before fixing.

Minor issues include:

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
- Replace runtime-specific commands, plugins, hooks, or slash commands with direct workflow instructions when they are not part of the target skill's intended environment.
- Preserve runtime-specific instructions only when they are clearly required by the target skill.
- Keep machine-readable completion markers only when the target workflow explicitly requires them.
- Prefer direct imperative instructions over model-specific phrasing such as "Claude should," "Codex should," or "the assistant should."
- Avoid unsupported frontmatter fields unless the target skill runtime documents them.
- Preserve the underlying workflow intent while removing unnecessary environment-specific mechanics.

## Required Verification Pass

After applying edits and before completion, re-run the `skill-reviewer` subagent.

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

## Completion Output

End with a concise report containing:

1. Files changed
2. Critical issues fixed
3. Major issues fixed
4. Minor issues fixed or skipped
5. Reviewer verdict
6. Remaining blockers, if any

Only output the following marker when the surrounding workflow explicitly requires a machine-readable stop signal:

```text
<skill-improvement-complete>
```

## Rationalizations to Reject

- "It is probably fine" — rely on the reviewer pass.
- "The reviewer is optional" — this skill depends on the installed reviewer subagent.
- "Minor issues can all be ignored" — evaluate each one.
- "The description is good enough" — the description must clearly trigger the skill.
- "Broken references are harmless" — broken references cause execution failures.
- "I can mark it complete before re-reviewing" — always re-run the reviewer after fixes.
- "The setup should be handled here" — subagent installation and configuration are out of scope.
