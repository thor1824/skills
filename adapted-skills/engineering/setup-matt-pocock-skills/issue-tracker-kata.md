# Issue tracker: Kata

Issues and specs for this repo live in the Kata project `{{KATA_PROJECT}}`.

Use typed Kata MCP tools for every issue operation. The Kata connector fixes the project scope and actor when it starts; do not try to change either through a tool call. The captured Kata contract at the end of this document is authoritative for workflow and safety. Its CLI examples express semantics only: translate them through the MCP adapter below instead of executing issue commands with the CLI.

<!-- BEGIN KATA MCP ADAPTER -->

## MCP adapter

Load a tool group before using tools from it:

- Project identity: `kata.load_projects`, then `kata.projects`. Require the single result to be `{{KATA_PROJECT}}`.
- Discovery: `kata.load_issue_discovery` for `kata.search`, `kata.list`, `kata.show`, `kata.labels`, `kata.ready`, `kata.next`, and `kata.graph`.
- Mutation: `kata.load_issue_mutation` for `kata.create`, `kata.edit`, `kata.comment`, `kata.claim`, `kata.set_label`, `kata.set_metadata`, `kata.set_schedule`, and `kata.set_deadline`.
- Lifecycle: `kata.load_issue_lifecycle` for `kata.wait`, `kata.close`, `kata.reopen`, `kata.delete`, `kata.restore`, `kata.purge`, and `kata.audit_closes`.
- Activity: `kata.load_activity` for `kata.events` and bounded event polling when attention-aware waiting is required.

### Find, read, and create

- Search before creating with `kata.search`; reuse an existing issue when it represents the same work. Use `kata.list` for structured filtering and `kata.show` for the full issue, links, metadata, and newest comments. A truncated comment result is not complete history.
- Create with `kata.create`. Always supply a stable `idempotency_key`; use the same key when retrying the same logical creation. Do not set `force_new` merely to bypass a likely duplicate.
- Publish to the issue tracker with `kata.create`. Fetch a relevant ticket with `kata.show`.

### Ownership, readiness, and progress

- Use `kata.ready` to list actionable issues or `kata.next` to select the deterministic highest-priority actionable issue. Readiness excludes open blockers, future schedules, and issues whose `someday` metadata is true.
- Claim with `kata.claim` before starting work. The owner is the actor fixed at connector startup. A normal claim must fail when another actor owns the issue; do not use `force` unless the user explicitly authorizes taking ownership.
- Add progress with `kata.comment`, always using a stable `idempotency_key`. Mutations and comments are separate MCP calls, so verify the mutation before posting its explanation.
- Unassign with `kata.edit` and `clear_owner: true`.

### Labels, fields, relationships, and metadata

- `kata.labels` reports labels already used in the project, not a registry of allowed labels. Add or remove a label idempotently with `kata.set_label` and `present: true` or `false`.
- At creation, `kata.create` accepts `parent`, `blocks`, `blocked_by`, and `related`. For later relationship changes, use the exact `kata.edit` delta fields: `add_blocks`/`remove_blocks`, `add_blocked_by`/`remove_blocked_by`, and `add_related`/`remove_related`. Set a parent with `parent`; remove it with `remove_parent` using the actual current parent reference. Parent is containment, blockers are readiness gates, and related links are context only.
- Prefer a separate `kata.set_metadata` call for metadata. A JSON null removes a key. Read metadata through `kata.show`; use its revision for conditional updates when concurrent writers are possible.
- Maintain `work.attention` and `work.attention_msg` together. The contract's attention values are conventions rather than MCP-enforced enums. Do not update `work.*` metadata on closed issues.
- Set or clear scheduling and deadlines with `kata.set_schedule` and `kata.set_deadline`. Represent someday work as metadata `someday: true`; remove it with null rather than setting false.

### Attention-aware waiting

MCP `kata.wait` can wait for issue status but cannot directly wait for `work.attention=needs-human|stuck`. To preserve the contract's attention wait without using the CLI:

1. Use `kata.events` with a cursor and a bounded timeout to wait for relevant changes.
2. Reread the issue with `kata.show` after each returned event or timeout.
3. Stop when the issue closes or its `work.attention` becomes `needs-human` or `stuck`.
4. Otherwise continue only within the caller's overall time bound. Never busy-loop or convert this into unbounded polling.

### Close, reopen, and deletion safety

- Close with `kata.close`, always supplying `reason`, `message`, and `evidence`. Use `dry_run: true` first when evidence validity is uncertain. Respect these typed forms and message minima:
  - `done`: message of at least 40 characters and at least one of `{type: "commit", sha: "..."}`, `{type: "pr", url: "..."}`, `{type: "test", command: "..."}`, `{type: "reviewed-paths", paths: ["..."]}`, or `{type: "external", account: "..."}`.
  - `wontfix`: message of at least 60 characters and exactly `evidence: []`.
  - `duplicate`: message of at least 20 characters and exactly one `{type: "duplicate-of", issue_ref: "..."}` item.
  - `superseded`: message of at least 20 characters and exactly one `{type: "superseded-by", issue_ref: "..."}` item.
  - `audit-no-change`: message of at least 40 characters, exactly one `{type: "no-change-audit", rationale: "..."}` item, and optionally reviewed-paths evidence.
- A parent with open children cannot close. Resolve or explicitly rehome the children first.
- Reopen with `kata.reopen`; post a separate idempotent comment when rationale is useful.
- Never call `kata.delete` or `kata.purge` unless the user explicitly authorizes that exact action and issue reference. Delete is reversible; purge is irreversible and applies only after deletion. Preserve the tools' exact `DELETE <project>#<short-id>` and `PURGE <project>#<short-id>` confirmations. Restore only with `kata.restore`.

## Wayfinding operations

Used by the `wayfinder` skill. The map and its tickets are Kata issues in `{{KATA_PROJECT}}`.

- **Map**: one issue labelled `wayfinder:map`, holding Notes, Decisions-so-far, and Fog.
- **Child ticket**: create with the map as `parent` and a `wayfinder:<type>` label (`research`, `prototype`, `grilling`, or `task`).
- **Blocking**: encode real readiness gates with `blocked_by`/`blocks`, not prose. Use `related` only for nongating context.
- **Frontier**: obtain the map's child references from its graph, call `kata.ready` for actionable unowned issues, and intersect the two result sets; preserve map order when choosing among the remaining children. `kata.ready` has no parent filter, so never treat its unfiltered result as this map's frontier.
- **Claim**: `kata.claim` is the session's first issue write.
- **Resolve**: post the answer with an idempotent `kata.comment`, close with valid evidence, then update the map with a context pointer in its Decisions-so-far.

<!-- END KATA MCP ADAPTER -->

## Canonical Kata contract

The following output was captured verbatim during setup with `kata quickstart --format contract`. Follow its workflow and safety rules through the MCP adapter above.

<!-- BEGIN KATA CANONICAL CONTRACT -->
{{KATA_QUICKSTART_CONTRACT}}
<!-- END KATA CANONICAL CONTRACT -->
