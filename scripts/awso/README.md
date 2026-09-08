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

Run `awso restore` once in each additional worktree. Run `awso update` after
adding, removing, or renaming files beneath `.agent-workspaces/overlay/`.

## Ignoring overlay files

`awso setup` creates `.agent-workspaces/overlay/.awsoignore`. Use it for files
that should remain in the canonical overlay without appearing in worktrees.
For example:

```gitignore
# Keep generated skill locks in the overlay only
skill-lock.json
**/skill-lock.yaml
```

The syntax follows familiar `.gitignore` conventions: blank lines and comments
are ignored, `!` negates a rule, a leading `/` anchors a rule to the overlay
root, a trailing `/` matches directories, and `*`, `**`, `?`, and character
classes are supported. Rules are evaluated in order, so the last matching rule
wins.

The root `.awsoignore` is never added to the manifest or linked into a
worktree. After changing its rules, run `awso update`; `awso status` reports an
out-of-date manifest until you do.

## Commands

### `awso setup`

Creates the canonical `.agent-workspaces/` structure in the main worktree and
adds AWSO-managed entries to Git's shared local exclusions. Existing personal
configuration is preserved.

### `awso update`

Inventories the static overlay, writes the sorted manifest, and updates the
shared Git exclusions. It rejects overlay paths that collide with tracked
repository files.

### `awso restore`

Hydrates the current worktree from the manifest. It creates links to static
overlay files and generates `AGENTS.override.md` for the current worktree.
Foreign files, foreign links, and tracked destinations are not overwritten.

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
