# Backlog.md tracker provider

Use this provider extension when `setup-matt-pocock-skills` is configured for Backlog.md. It defines deterministic creation and update behavior for `docs/agents/issue-tracker.md`.

## Rendering parameters

- `ready_for_agent_label`: the resolved tracker label mapped from Matt's canonical `ready-for-agent` role. Its default is `ready-for-agent`.
- `default_status`: the configured status used for new work.
- `active_status`: the configured status used after a task is claimed.
- `terminal_status`: the configured successful terminal status.

Render the output template below by replacing `{{ready_for_agent_label}}`, `{{default_status}}`, `{{active_status}}`, and `{{terminal_status}}` with their resolved values. No other placeholder substitutions are supported.

## Creation and update rules

- The output contains one provider-owned block delimited by the start and end markers shown in the template.
- When the file is absent, create it from the rendered template.
- When both markers occur exactly once and in order, replace only the delimited block and preserve all content outside it.
- For a legacy unmarked file, migrate it only when its first heading is exactly `# Issue tracker: Backlog.md` and its recognized sections are the ones in this template. Replace those recognized sections with the managed block and preserve additional level-two sections after the block.
- Die rather than overwrite an unrelated provider, malformed markers, duplicate managed blocks, or content whose ownership is ambiguous.

## Output template

````markdown
<!-- setup-agent-workspace:backlog-tracker:start -->
# Issue tracker: Backlog.md

Issues and specs for this repo live as Backlog.md tasks in the repository. Use the `backlog` CLI for tracker operations. Prefer `--json` for reads performed by agents.

Before tracker work, run `backlog instructions overview` and follow Backlog.md's current CLI workflow guidance.

Do not hand-edit Backlog.md task files for normal tracker operations.

## Conventions

- **Create a task**: `backlog task create "..." -d "..."`. Add labels with `-l label1,label2` and acceptance criteria with `--ac "..."` where the calling skill provides them.
- **Read a task**: `backlog task <id> --json`.
- **List tasks**: `backlog task list --json` with the appropriate `--status`, `--labels`, `--parent`, `--assignee`, and `--ready` filters.
- **Comment**: `backlog task edit <id> --comment "..."`.
- **Apply labels / assignees / status**: `backlog task edit <id> -l ... -a ... -s "..."`. Preserve unrelated existing values when changing list-valued fields.
- **Close successfully**: move the task to the repository's terminal status with `backlog task edit <id> -s "{{terminal_status}}"`.
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

```sh
backlog task <id> --json
```

If an implementation ticket has a parent, fetch the parent too when the calling skill needs the originating spec.

## Wayfinding operations

Used by the Wayfinder skill or workflow. The **map** is a parent Backlog.md task with **child** tasks as decision tickets.

- **Map**: create one task labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: create a child with `backlog task create -p <map-id> "..." -l wayfinder:<type>,{{ready_for_agent_label}}`, where `<type>` is `research`, `prototype`, `grilling`, or `task`.
- **Blocking**: native dependencies are canonical. If child B is blocked by child A, add A to B: `backlog task edit <B> --dep <A>`. Do not encode blocking only in prose.
- **Frontier query**: list the map's open children with native readiness, e.g. `backlog task list --parent <map-id> --status "{{default_status}}" --labels {{ready_for_agent_label}} --ready --json`, then drop already-assigned/claimed tasks. First in map order wins unless the map says otherwise.
- **Claim**: as the session's first tracker write, move the child to `{{active_status}}` and assign the current actor when available. Backlog.md claims are advisory, not atomic leases; parallel workers must re-read after claiming and back off if another worker already owns the task.
- **Resolve**: append the answer as a comment, move the child to `{{terminal_status}}`, then append the durable context pointer to the map's Decisions-so-far. Re-query the native frontier afterward.
<!-- setup-agent-workspace:backlog-tracker:end -->
````
