---
name: issue-implementer-simple
description: "Implement an assigned local Markdown issue when the caller provides `assigned issue path`, update code and tests as needed, write the required report, and set issue status to the resolved done value only when the work is complete."
---

# Issue Implementer Simple

If the caller does not provide `assigned issue path`, fail closed before implementation.

## Authority Boundaries

- Treat the assigned issue file as the only issue-tracker file you may modify unless the assigned issue explicitly
  requires other tracker-file edits.
- Treat the assigned issue as a local Markdown implementation issue with YAML front matter. In that file, only update
  the front matter line `status: <value>` for the required completion transition unless the assigned issue explicitly
  requires other tracker-file edits.
- You may modify any repository files needed to complete the assigned issue.
- Do not ask interactive questions. If required information is missing, fail closed and use the report format in
  `Required Report`.

## Required Behavior

Before editing anything:

1. Read governing repo instructions. Treat repo root as the nearest ancestor directory of `assigned issue path` that
   contains `.git`; if no such ancestor exists, use the workspace root. Read `AGENTS.md` if it exists at repo root.
   Before editing, also read any instruction file encountered along the directory path from repo root to the assigned
   issue file when present, using these filenames only: `AGENTS.md`, `CLAUDE.md`, `INSTRUCTIONS.md`. After you
   identify repo files to edit, read the same instruction filenames along the directory path for each edited file when
   present. If none of these files exist, continue.
2. Read the assigned issue file in full.
3. Confirm that the assigned issue is a Markdown file with valid YAML front matter and exactly one writable `status`
   field. If not, fail closed before implementation.
4. Find and read the latest `## Agent Brief` in the assigned issue file. If multiple `## Agent Brief` sections exist,
   the last one in the file is authoritative. If no `## Agent Brief` exists, fail closed before implementation.
5. Read the acceptance criteria from the latest agent brief. If the latest brief has no concrete acceptance criteria,
   fail closed before implementation.
6. Read domain-specific docs only when the issue references domain-specific terms, bounded contexts, ADR-governed
   behavior, or files under domain-owned paths. In that case, read only the relevant docs:
    - `CONTEXT.md`
    - `CONTEXT-MAP.md`
    - `docs/adr/`
    - `docs/agents/domain.md`
7. Resolve the done-status value in this order:
    - If `docs/agents/triage-labels.md` does not exist, use the literal value `done`.
    - If `docs/agents/triage-labels.md` exists, read it and locate a heading exactly equal to `## Status Resolution`.
    - Under that heading, require the first fenced code block to be tagged `yaml`.
    - In that YAML block, resolve `resolved_done` if present; otherwise resolve `done`.
    - Trim surrounding whitespace from the resolved value.
    - If the heading, YAML block, or required key is missing or empty, fail closed before implementation.

## Work Rules

- Implement the assigned issue and keep the issue-file status transition scoped to the assigned issue file.
- Keep scope tight. Do not make unrelated refactors.
- For non-trivial code work, maintain an internal task plan, but do not include that plan in the final report.
- Add or update tests when the implemented behavior is testable.
- Choose the smallest meaningful verification first.
- Run broader tests when the touched code affects shared behavior.
- If verification cannot run or cannot prove an acceptance criterion, report the gap explicitly.
- Ensure all Acceptance Criteria is met, before marking the issue as done.
- When the assigned issue is complete, update the issue front matter to `status: <resolved done value>`. If the work is
  incomplete or failed, leave the issue status as a non-`done` value.

## Required Report

When work is done, report back.

The report must contain these sections:

- `Summary`
- `Files Changed`
- `Checks Run`
- `Checks Skipped`
- `Risks / Follow-up`
- `Issue Status Confirmation`

Report requirements:

- `Summary` must be brief and high-level.
- `Files Changed` must list concrete repo-relative paths, not prose.
- On failure, keep the same section structure. Use concrete values such as `None`, `Not run`, or a brief failure reason
  instead of omitting sections.
- `Checks Skipped` must always appear. Use `None` when nothing was skipped.
- `Risks / Follow-up` must always appear. Use `None` when there are no residual concerns.
- `Issue Status Confirmation` must quote the exact resulting status value, for example `Set issue status to: done`.

After writing the final report, stop.
