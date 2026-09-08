# Issue tracker: Backlog.md

Issues and specs for this repo live as Backlog.md tasks in the repository. Use the `backlog` CLI for tracker operations. Prefer `--json` for reads performed by agents.

Before tracker work, run `backlog instructions overview` and follow Backlog.md's current workflow guidance. If this runtime is configured through MCP instead of the CLI, use the equivalent Backlog.md MCP operations and read `backlog://workflow/overview`.

Do not hand-edit Backlog.md task files for normal tracker operations.

## Conventions

- **Create a task**: `backlog task create "..." -d "..."`. Add labels with `-l label1,label2` and acceptance criteria with `--ac "..."` where the calling skill provides them.
- **Read a task**: `backlog task <id> --json`.
- **List tasks**: `backlog task list --json` with the appropriate `--status`, `--labels`, `--parent`, `--assignee`, and `--ready` filters.
- **Comment**: `backlog task edit <id> --comment "..."`.
- **Apply labels / assignees / status**: `backlog task edit <id> -l ... -a ... -s "..."`. Preserve unrelated existing values when changing list-valued fields.
- **Close successfully**: move the task to the repository's terminal status, normally `backlog task edit <id> -s "Done"`.
- **Blocking**: on the blocked task, use `--dep <blocker-id>`. For "B is blocked by A", B depends on A.
- **Parent/child**: use `-p <parent-id>` / `--parent <parent-id>`. Tickets created from a spec should be children of that spec when possible; parentage is structural, while `--dep` expresses execution blocking.
- **Readiness**: use Backlog.md's derived `isReady` value or `backlog task list --ready`; do not reimplement dependency resolution.
- Use the exact full task ID returned by Backlog.md (for example `BACK-42` or `TASK-42`). Do not assume the configured prefix.
- Backlog.md is repository/worktree-local. Run tracker mutations from the checkout that owns the work.

## Pull requests as a triage surface

**PRs as a request surface: no.** Backlog.md tasks are the configured request/issue surface unless the repo explicitly defines a separate PR-ingestion policy.

## When a skill says "publish to the issue tracker"

Create a Backlog.md task and return its full task ID.

When publishing implementation tickets from a spec, create them as children of the spec with `-p <spec-id>`. Publish blockers before dependents so dependent tasks can reference real blocker IDs with `--dep`.

## When a skill says "fetch the relevant ticket"

Run:

```bash
backlog task <id> --json
```

If an implementation ticket has a parent, fetch the parent too when the calling skill needs the originating spec.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent Backlog.md task with **child** tasks as decision tickets.

- **Map**: create one task labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: create a child with `backlog task create -p <map-id> "..." -l wayfinder:<type>,ready-for-agent`, where `<type>` is `research`, `prototype`, `grilling`, or `task`.
- **Blocking**: native dependencies are canonical. If child B is blocked by child A, add A to B: `backlog task edit <B> --dep <A>`. Do not encode blocking only in prose.
- **Frontier query**: list the map's open children with native readiness, e.g. `backlog task list --parent <map-id> --status "To Do" --labels ready-for-agent --ready --json`, then drop already-assigned/claimed tasks. First in map order wins unless the map says otherwise.
- **Claim**: as the session's first tracker write, move the child to the active status (`In Progress` by default) and assign the current actor when available. Backlog.md claims are advisory, not atomic leases; parallel workers must re-read after claiming and back off if another worker already owns the task.
- **Resolve**: append the answer as a comment, move the child to the terminal status (`Done` by default), then append the durable context pointer to the map's Decisions-so-far. Re-query the native frontier afterwards.
