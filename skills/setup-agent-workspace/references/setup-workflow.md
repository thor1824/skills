# Setup workflow

Follow this state machine in order. Immediately record each successful edit or mutating command in an in-memory ledger; write no log file.

## 1. Preflight

Before mutation, require:

- a Git working tree
- `awso` on `PATH`, with working `help`, `setup`, `add`, `update`, `restore`, and `status` commands
- `backlog` on `PATH`, with the noninteractive `init` options used below
- installed skills named `setup-matt-pocock-skills` and `triage`

If anything is missing, die with installation or upgrade guidance; install nothing.

Resolve the Git root. Compare canonical worktree-specific and common Git directories; die outside Git or in a linked worktree. Run from this main-worktree root unless a step sets `BACKLOG_CWD`.

Use the root basename only for a fresh project. Otherwise preserve `project_name` or legacy `projectName` unless overridden. Never inspect or edit `CLAUDE.md`.

Inspect before mutation:

- AWSO manifest, overlay, sources, and `AGENTS.extend.md`
- root and overlay Backlog configs, configured boards, and `AGENTS.md`
- folder-local `backlog/config.{yml,yaml}` and `.backlog/config.{yml,yaml}`
- overlay `docs/agents/`

Detect Backlog only from exact-local files; upward search can find the wrong project. Support only root `backlog.config.yml`; die on folder-local config.

Parse every config. Read its project name and `backlog_directory` or legacy `backlogDirectory`; inspect both board counterparts for existence, type, symlink ownership, Git status, tracking, and duplication.

Require a normalized, nonempty, repository-relative board path using `/`. Reject NUL, CR, LF, backslashes, empty/`.`/`..` segments, and first components `.agent-workspaces`, `.git`, or `AGENTS.override.md`.

Infer manifest directory entries from overlay types. Die if one is a board ancestor; AWSO would retain it instead of the required exact entry. Allow the exact entry and child entries.

Die for modified tracked instructions or any tracked Backlog path. Allow recognized untracked root-only Backlog sources and partial AWSO-owned repair paths, but no unrelated content inside them. Ignore unrelated changes elsewhere.

Die on separate copies, foreign root symlinks, differing destinations, foreign temporary `AGENTS.md` content, or ambiguous managed ownership.

## 2. Establish AWSO

Run `awso setup`, including for recognizable partial state. Require a version-1 `files` manifest, real overlay and sources directories, and regular `sources/AGENTS.extend.md`; otherwise die.

Use:

```text
root    = resolved main-worktree root
overlay = root/.agent-workspaces/overlay
extend  = root/.agent-workspaces/sources/AGENTS.extend.md
```

## 3. Establish Backlog.md

Classify Backlog state:

- Keep root paths already linked by AWSO to a valid overlay project.
- Resume when only the overlay has a valid config and board.
- Relocate a valid untracked root-only config and board to matching overlay paths.
- Initialize when neither location is configured.
- Otherwise die.

For existing state, preserve the project name unless overridden.

For a fresh project:

```sh
BACKLOG_CWD="$overlay" backlog init "$project_name" \
  --defaults \
  --integration-mode cli \
  --agent-instructions agents \
  --config-location root \
  --backlog-dir .backlog
```

For an existing project, refresh versioned instructions without fixed initialization options:

```sh
BACKLOG_CWD="$overlay" backlog init "$project_name" \
  --defaults \
  --integration-mode cli \
  --agent-instructions agents
```

Reread `overlay/backlog.config.yml`; its board setting is authoritative. Without editing statuses, resolve default=`default_status`, active=the first later `statuses` entry, and terminal=the last entry. Die if ambiguous; retain them for the tracker template.

Use `apply_patch` for text changes. Preserve every relocated artifact; never leave a split board.

## 4. Reconcile agent instructions

Extract the complete versioned block from Backlog's temporary `overlay/AGENTS.md`:

```text
<!-- BACKLOG.MD GUIDELINES START -->
...
<!-- BACKLOG.MD GUIDELINES END -->
```

Replace or append this block in `extend`, preserving other content. Require one marker pair, then delete the temporary file with `apply_patch`.

The fresh block is authoritative. Remove any root Backlog block, preserve content outside its markers, and never merge stale managed content.

Before removing a root `## Agent skills` section, merge it into `extend`. Preserve user text and extra subsections; deduplicate `### Issue tracker`, `### Triage labels`, and `### Domain docs`. Die on unclear conflicts. The section ends at the next level-two heading or EOF; do not claim similar names.

## 5. Apply Matt Pocock setup

Read [issue-tracker-backlog-md.md](issue-tracker-backlog-md.md), then follow installed `setup-matt-pocock-skills` with these overrides:

- Explore root read-only: remotes, code, context docs, ADRs, and monorepo signals.
- Treat `overlay` as the logical root for every write.
- Use Backlog.md and the provider rules for `overlay/docs/agents/issue-tracker.md`; substitute resolved `ready-for-agent` and statuses.
- Always enable triage. Use its five default mappings unless invocation instructions override them.
- Default to single-context; use multi-context only when evidence or invocation selects it.
- Write or update overlay `docs/agents/issue-tracker.md`, `domain.md`, and `triage-labels.md`.
- Put `## Agent skills` in `extend`, never `AGENTS.md` or `CLAUDE.md`.
- Skip its questions, draft review, edit pause, and confirmation.

Reconcile every run. Update only recognized Agent-skills subsections, preserve other content, and apply provider boundaries to the tracker doc. Die on ambiguous ownership; require one Agent-skills section in `extend`.

## 6. Reconcile Backlog taxonomy

Edit `overlay/backlog.config.yml`, preserving other settings, comments, values, and statuses.

Append missing resolved triage labels—`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`—plus:

- `wayfinder:research`
- `wayfinder:prototype`
- `wayfinder:grilling`
- `wayfinder:task`
- `wayfinder:map`

Ensure types include `bug`, `feature`, `enhancement`, `task`, `chore`, `docs`, `spike`, and `epic`. Append requested extras without duplicates; change nothing else.

## 7. Publish through AWSO

Require a real, non-symlink overlay board. From `root`, run:

```sh
awso add "$backlog_directory"
awso update
awso restore
```

`awso add` must create one board-directory entry. Let `awso update` inventory config and Matt files; never edit the manifest.

## 8. Verify and report

Require:

- `awso status` exits `0`.
- The version-1 manifest is sorted and unique, with `backlog.config.yml`, the exact board entry, and every Matt file.
- Root config and board paths are exact symlinks into the overlay.
- Backlog reads its config from `root`.
- `extend` has one Backlog marker pair and one Agent-skills section.
- Root `AGENTS.md` has neither managed section.
- `overlay/AGENTS.md` is absent.
- Root `CLAUDE.md` is untouched.

Report root, project name, board, added taxonomy, reconciled files, and passed checks.

On failure, stop without rollback. Report the ledger, any partial command changes, and the failed command or invariant. Resume only safe, recognizable partial state.
