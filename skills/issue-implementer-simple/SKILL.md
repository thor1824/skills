---
name: issue-implementer-simple
description: "Use this skill only for an orchestrated local Markdown issue workflow where the runtime provides `assigned worktree`, `assigned issue path`, `assigned report path`, and optional `assigned done status`. Implement the assigned issue, update code and tests as needed, write the required report, and set the issue status to the resolved done value only when the work is complete."
---

# Issue Implementer Simple

This skill is for an orchestrated workflow. You receive exactly four runtime values:

- `assigned worktree`: An absolute path to the repository worktree you may modify. It must exist.
- `assigned issue path`: A path to the assigned local Markdown issue file. If it is relative, resolve it from `assigned worktree`. If it is absolute, it must stay inside `assigned worktree`.
- `assigned report path`: An absolute path to the required report file. It must be inside `.agents/issue-manager/` under `assigned worktree`.
- `assigned done status`: An optional tracker value for the canonical done state. If this value is provided, use it. If it is not provided, resolve the done state from repo instructions as described below and fall back to the literal value `done` only when no repo-defined done state exists.

If `assigned report path` is valid, inside the allowed directory, and writable, write a failure report there for every failure case, including early validation failures. Use the agent response only when writing that report file is impossible because the path is missing, invalid, outside the allowed directory, or not writable.

If `assigned worktree` is missing, not absolute, or does not exist, fail closed immediately. If `assigned issue path` is missing, fail closed immediately. If `assigned report path` is missing, invalid, outside `.agents/issue-manager/`, or cannot be written safely, fail closed immediately and make no repository changes.

## Authority Boundaries

- Work only inside `assigned worktree`.
- Modify only files that remain inside `assigned worktree`.
- Treat the assigned issue file as the only issue-tracker file you may modify unless the assigned issue explicitly requires other tracker-file edits.
- Treat the assigned issue as a local Markdown implementation issue with YAML front matter. In that file, only update the front matter line `status: <value>` for the required completion transition unless the assigned issue explicitly requires other tracker-file edits.
- You may modify any repository files needed to complete the assigned issue.
- Under `.agents/issue-manager/`, write only `assigned report path`.
- Do not ask interactive questions. If required information is missing, fail closed and use the report-writing rule above.

## Required Behavior

Before editing anything:

1. Validate `assigned worktree`. It must be present, absolute, and exist.
2. Resolve `assigned issue path` against `assigned worktree` when it is relative. If the resolved path is outside `assigned worktree`, fail closed before implementation.
3. Validate `assigned report path`. It must be absolute, inside `.agents/issue-manager/` under `assigned worktree`, and safe to write. If not, fail closed before implementation.
4. Read governing repo instructions. Read `AGENTS.md` if it exists. Also read any nested instruction files relevant to the working directory when those files exist. If no repo instruction files exist, continue.
5. Read the assigned issue file in full.
6. Confirm that the assigned issue is a Markdown file with valid YAML front matter and exactly one writable `status` field. If not, fail closed before implementation.
7. Find and read the latest `## Agent Brief` in the assigned issue file. If multiple `## Agent Brief` sections exist, the last one in the file is authoritative. If no `## Agent Brief` exists, fail closed before implementation.
8. Read the acceptance criteria from the latest agent brief. If the latest brief has no concrete acceptance criteria, fail closed before implementation.
9. Read domain-specific docs only when the issue references domain-specific terms, bounded contexts, ADR-governed behavior, or files under domain-owned paths. In that case, read only the relevant docs:
- `CONTEXT.md`
- `CONTEXT-MAP.md`
- `docs/adr/`
- `docs/agents/domain.md`
10. Resolve the done-status value in this order:
- Use `assigned done status` when it is provided.
- Otherwise, check `docs/agents/triage-labels.md` if it exists.
- Otherwise, check any other repo instruction file you already read that explicitly defines the canonical done status.
- Otherwise, use the literal value `done`.

## Work Rules

- Implement the assigned issue and keep the issue-file status transition scoped to the assigned issue file.
- Keep scope tight. Do not make unrelated refactors.
- For non-trivial code work, maintain an internal task plan, but do not include that plan in the final report.
- Add or update tests when the implemented behavior is testable.
- Choose the smallest meaningful verification first.
- Run broader tests when the touched code affects shared behavior.
- If verification cannot run or cannot prove an acceptance criterion, report the gap explicitly.
- When the assigned issue is complete, update the issue front matter to `status: <resolved done value>`. If the work is incomplete or failed, leave the issue status as a non-`done` value.

## Required Report

Always write the report to `assigned report path` on success and on failure whenever that path is valid and writable. Use the agent response only as a fallback when writing the report is impossible because the path is missing, invalid, outside the allowed directory, or not writable.

The written report must contain these sections:

- `Summary`
- `Files Changed`
- `Checks Run`
- `Checks Skipped`
- `Risks / Follow-up`
- `Issue Status Confirmation`

Report requirements:

- `Summary` must be brief and high-level.
- `Files Changed` must list concrete repo-relative paths, not prose.
- On failure, keep the same section structure. Use concrete values such as `None`, `Not run`, or a brief failure reason instead of omitting sections.
- `Checks Skipped` must always appear. Use `None` when nothing was skipped.
- `Risks / Follow-up` must always appear. Use `None` when there are no residual concerns.
- `Issue Status Confirmation` must quote the exact resulting status value, for example `Set issue status to: done`.

After writing the final report, stop.
