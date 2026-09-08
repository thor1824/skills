# AWSO

AWSO keeps personal, repository-specific agent configuration available across
Git worktrees without committing it to the repository.

It stores the canonical configuration in `.agent-workspaces/` in the main
worktree. Static files are linked into each worktree, while
`AGENTS.override.md` is generated per worktree from the tracked `AGENTS.md` and
your personal `AGENTS.extend.md`.

## Requirements

- Git
- Node.js
- Bash
- Make, for the provided install and uninstall commands

## Install

From this directory, install `awso` into `~/.local/bin`:

```sh
make install
```

Ensure `~/.local/bin` is on `PATH`. To choose a different location, override
`PREFIX` or `BINDIR`:

```sh
make install PREFIX=/usr/local
make install BINDIR="$HOME/bin"
```

The installation is a symlink to this checkout. Remove it with:

```sh
make uninstall
```

## Quick start

Run setup from any worktree in the target repository:

```sh
awso setup
```

Add personal files beneath the overlay directory in the main worktree. Their
paths beneath `overlay/` are the paths where they will appear in every
worktree. For example:

```text
.agent-workspaces/overlay/.codex/hooks/before-test
```

Then synchronize the manifest and hydrate the current worktree:

```sh
awso update
awso restore
awso status
```

To link a whole overlay folder instead of its individual files, add its path
relative to the overlay and restore:

```sh
awso add .config/tool
awso restore
```

Run `awso restore` once in each additional worktree. Run `awso update` after
adding, removing, or renaming files beneath `.agent-workspaces/overlay/`.

## Skill directories

Each immediate directory beneath `.agents/skills/` is treated as one overlay
entry. For example, AWSO links:

```text
<worktree>/.agents/skills/example
  -> <main-worktree>/.agent-workspaces/overlay/.agents/skills/example
```

It does not create separate links for `SKILL.md`, references, scripts, or other
files inside that skill. Existing legacy skill directories containing only
AWSO-owned file links are migrated automatically. A directory containing any
foreign entry remains a conflict and is not replaced.

Files directly beneath `.agents/skills/` are still handled individually, so a
root-level skill lock can remain overlay-only through `.awsoignore`.

## Ignoring overlay files

`awso setup` creates `.agent-workspaces/overlay/.awsoignore`. Use it for files
that should remain in the canonical overlay without appearing in worktrees.
For example:

```gitignore
# Keep generated skill locks in the overlay only
/.agents/skills/skill-lock.json
/.agents/skills/skill-lock.yaml
```

The syntax follows familiar `.gitignore` conventions: blank lines and comments
are ignored, `!` negates a rule, a leading `/` anchors a rule to the overlay
root, a trailing `/` matches directories, and `*`, `**`, `?`, and character
classes are supported. Rules are evaluated in order, so the last matching rule
wins.

The root `.awsoignore` is never added to the manifest or linked into a
worktree. After changing its rules, run `awso update`; `awso status` reports an
out-of-date manifest until you do.

Because a skill directory is linked as a single unit, ignore rules cannot hide
individual files inside that directory. Keep overlay-only lock files directly
beneath `.agents/skills/`, beside the skill directories.

## Commands

### `awso setup`

Creates the canonical `.agent-workspaces/` structure in the main worktree and
adds AWSO-managed entries to Git's shared local exclusions. Existing personal
configuration is preserved.

### `awso update`

Inventories the static overlay, writes the sorted manifest, and updates the
shared Git exclusions. It rejects overlay paths that collide with tracked
repository files.

### `awso add <folder>`

Adds a real directory beneath `.agent-workspaces/overlay/` to the manifest as
one entry. The path is relative to the overlay root:

```sh
awso add .config/tool
```

Existing child-file entries are replaced by the directory entry. Subsequent
`awso update` and `awso status` calls preserve it, and `awso restore` links the
whole directory. The command rejects missing paths, symlinked directories,
ignored directories, and destinations containing tracked repository files.

As with directory-linked skills, `.awsoignore` cannot hide individual files
inside a directory added this way because the symlink exposes the complete
folder.

### `awso restore`

Hydrates the current worktree from the manifest. It creates links to static
overlay files and generates `AGENTS.override.md` for the current worktree.
Foreign files, foreign links, and tracked static-overlay destinations are not
overwritten. `AGENTS.override.md` is the exception: every restore regenerates
it, replacing an existing regular file or symlink even when Git tracks it.

### `awso status`

Performs a read-only health check and reports whether `update` or `restore` is
needed. Its exit codes are:

- `0`: healthy
- `1`: restore required
- `2`: update required
- `3`: conflict or invalid configuration

### `awso help`

Prints the command summary. It does not require the current directory to be in
a Git repository.

## Workspace layout

```text
.agent-workspaces/
├── manifest.json
├── overlay/
│   ├── .awsoignore
│   └── ... personal files mirrored by repository-relative path
└── sources/
    └── AGENTS.extend.md
```

AWSO also manages `AGENTS.override.md` in each hydrated worktree and a marked
section in the repository's shared Git `info/exclude` file.

For the complete behavior and safety rules, see the
[AWSO script specification](../../docs/plans/AWSO%20Script%20Specification.md).
