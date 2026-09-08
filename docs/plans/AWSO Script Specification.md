# AWSO

The awso system provides a way to maintain personal, repository-specific agent configuration without committing that configuration to the repository.

It uses a hidden `.agent-workspaces/` directory in the main Git worktree as the canonical store for personal configuration. Static files such as Codex hooks are symlinked into every worktree at their expected repository-relative paths. Worktree-dependent files such as `AGENTS.override.md` are generated separately inside each worktree so they can incorporate that worktree's current tracked `AGENTS.md`.

The CLI exposes four primary operations:

```text
awso setup
awso update
awso restore
awso status
awso help
```

The intended lifecycle is:

```text
awso setup
          ↓
edit personal overlay
          ↓
awso update
          ↓
create/switch worktree
          ↓
awso restore
          ↓
awso status
```

All operations should be safe to run repeatedly.

---

# 1. `awso setup`

## Purpose

Initializes awso support for a Git repository.

This command establishes the canonical `.agent-workspaces/` directory in the repository's main worktree, creates the initial personal extension file, and configures Git so awso artifacts are ignored across all linked worktrees.

It should normally only need to be run once per repository, but rerunning it must be safe.

## Responsibilities

The command should:

1. Verify that the current directory belongs to a Git repository.
2. Determine the repository's main worktree.
3. Determine the Git common directory.
4. Create the awso directory structure in the main worktree.
5. Create `AGENTS.extend.md` if it does not already exist.
6. Create the static overlay directory if it does not already exist.
7. Create an initial manifest if none exists.
8. Ensure `.agent-workspaces/` is excluded from Git.
9. Ensure generated awso artifacts such as `AGENTS.override.md` are excluded from Git.
10. Never overwrite existing user configuration.

## Resulting structure

After setup, the main worktree should contain:

```text
repo/
├── .agent-workspaces/
│   ├── sources/
│   │   └── AGENTS.extend.md
│   ├── overlay/
│   │   └── .awsoignore
│   └── manifest.json
├── AGENTS.md
└── ...
```

The manifest may initially contain no overlay files:

```json
{
  "version": 1,
  "files": []
}
```

## `AGENTS.extend.md`

`AGENTS.extend.md` contains the developer's personal additions to the repository's tracked `AGENTS.md`.

For example:

```markdown
# Personal agent instructions

- Prefer running targeted tests before the entire test suite.
- Do not modify generated API clients manually.
- Use my local debugging helper when investigating HTTP failures.
```

This file should live under:

```text
.agent-workspaces/sources/AGENTS.extend.md
```

rather than directly in the repository root.

It is source material for awso rather than an instruction file agents should consume directly.

## Git exclusions

The command should update:

```text
$GIT_COMMON_DIR/info/exclude
```

rather than modifying the repository's committed `.gitignore`.

This keeps the configuration developer-local while ensuring the exclusions apply to linked worktrees.

At minimum, setup should ensure:

```gitignore
/.agent-workspaces/
/AGENTS.override.md
```

are excluded.

Workspace-overlay should own a clearly marked section:

```gitignore
# >>> awso
/.agent-workspaces/
/AGENTS.override.md
# <<< awso
```

Other contents of `info/exclude` must remain untouched.

## Safety behavior

If `.agent-workspaces/` already exists, setup should preserve it.

If `AGENTS.extend.md` already exists, setup should preserve its contents.

If awso has already configured `info/exclude`, setup should update or verify the existing managed section rather than creating duplicates.

Running:

```text
awso setup
```

multiple times should therefore have the same result as running it once.

## Example output

```text
Workspace overlay initialized.

Main worktree:
  /home/user/src/project

Workspace:
  /home/user/src/project/.agent-workspaces

Created:
  sources/AGENTS.extend.md
  overlay/
  manifest.json

Updated Git exclusions.

Next:
  Add personal files under .agent-workspaces/overlay/
  then run `awso update`.
```

---

# 2. `awso update`

## Purpose

Synchronizes awso's metadata with the current contents of:

```text
.agent-workspaces/overlay/
```

This command is run whenever the developer adds, removes, or reorganizes personal overlay files.

It determines which repository-relative paths belong to awso, writes those paths into the manifest, and updates Git's local exclusion rules accordingly.

It does not restore files into worktrees.

It also does not generate `AGENTS.override.md`, because that file depends on the `AGENTS.md` belonging to each individual worktree.

## Responsibilities

The command should:

1. Locate the main worktree.
2. Locate `.agent-workspaces/overlay/`.
3. Scan the overlay for files and symlinks that should be materialized into worktrees.
4. Generate a normalized manifest.
5. Determine the corresponding repository-relative destination paths.
6. Update the awso section of `$GIT_COMMON_DIR/info/exclude`.
7. Detect conflicts with paths already tracked by Git.
8. Detect reserved or invalid overlay paths.
9. Report additions, removals, unchanged files, and conflicts.

## Overlay semantics

The directory structure inside:

```text
.agent-workspaces/overlay/
```

mirrors where files should appear in a worktree.

The root-level `.awsoignore` controls which overlay entries are not
materialized. AWSO creates this file during setup, preserves user changes on
subsequent setup runs, and never includes the file itself in the manifest.
Patterns use Gitignore-style ordering and matching, including comments,
negation, root anchoring, directory-only rules, wildcards, and character
classes. Ignored files may remain in the overlay—for example generated
`skill-lock.json` files—but are omitted from the manifest, Git exclusions, and
worktree symlinks. Changing `.awsoignore` makes the manifest stale until
`awso update` is run.

For example:

```text
.agent-workspaces/
└── overlay/
    ├── .codex/
    │   └── hooks/
    │       ├── before-test
    │       └── after-edit
    └── .my-agent/
        └── config.json
```

represents:

```text
<worktree>/
├── .codex/
│   └── hooks/
│       ├── before-test
│       └── after-edit
└── .my-agent/
    └── config.json
```

## Manifest

The manifest should inventory materialized files, not every parent directory.

For example:

```json
{
  "version": 1,
  "files": [
    ".codex/hooks/after-edit",
    ".codex/hooks/before-test",
    ".my-agent/config.json"
  ]
}
```

Paths should:

- be repository-relative,
- use `/` separators,
- contain no leading `/`,
- contain no `..`,
- be deterministically sorted.

Parent directories should not need explicit entries.

When restoring:

```text
.codex/hooks/before-test
```

the restore command can create:

```text
.codex/
.codex/hooks/
```

automatically.

## Why individual files are inventoried

Workspace-overlay should generally symlink individual files rather than entire parent directories.

For example:

```text
.codex/
├── project-config.toml    ← tracked by repository
└── hooks/
    └── before-test        ← personal overlay
```

can coexist safely if only:

```text
.codex/hooks/before-test
```

is owned by awso.

Symlinking the entire `.codex/` directory would make this coexistence difficult or impossible.

## Updating exclusions

From the manifest:

```json
{
  "files": [
    ".codex/hooks/before-test",
    ".my-agent/config.json"
  ]
}
```

the managed exclusion block becomes:

```gitignore
# >>> awso
/.agent-workspaces/
/AGENTS.override.md
/.codex/hooks/before-test
/.my-agent/config.json
# <<< awso
```

The command should completely regenerate only the managed block.

This means deleting an overlay file also removes its obsolete Git exclusion.

Unrelated contents of `info/exclude` must remain untouched.

## Collision detection

Before accepting an overlay path, `awso update` should check whether the corresponding path is tracked by Git.

For example, if the overlay contains:

```text
.codex/config.toml
```

but the repository tracks:

```text
.codex/config.toml
```

the command should report a conflict.

This should be treated as an error rather than silently allowing the overlay to shadow project configuration.

Example:

```text
ERROR: awso path conflicts with tracked repository file

  .codex/config.toml

Remove the file from the overlay or choose another destination.
```

The update should fail before writing an invalid manifest.

## Reserved paths

Some paths belong to awso itself and should never be permitted inside the static overlay.

At minimum:

```text
.agent-workspaces/
AGENTS.override.md
```

should be reserved.

If the user places:

```text
.agent-workspaces/overlay/AGENTS.override.md
```

the update command should reject it.

`AGENTS.override.md` is generated separately for each worktree.

## Idempotency

Running:

```text
awso update
```

without changing the overlay should result in no meaningful changes.

Example:

```text
Workspace overlay already up to date.

3 overlay files
0 added
0 removed
0 conflicts
```

## Example change

Suppose the existing overlay contains:

```text
.codex/hooks/before-test
```

and the developer adds:

```text
.codex/hooks/after-edit
```

Running:

```text
awso update
```

could report:

```text
Workspace overlay updated.

Added:
  .codex/hooks/after-edit

Current overlay:
  2 files

Git exclusions updated.
```

---

# 3. `awso restore`

## Purpose

Materializes the personal workspace overlay into the current Git worktree.

Static overlay files are symlinked from the canonical overlay stored in the main worktree.

`AGENTS.override.md` is generated specifically for the current worktree by combining that worktree's tracked `AGENTS.md` with the personal `AGENTS.extend.md`.

This command is intended to be run after creating a new worktree or whenever overlay artifacts have been removed or damaged.

For example:

```text
git worktree add ../project-feature -b feature
cd ../project-feature

awso restore
```

Afterward the new worktree should be ready to use with the developer's normal agent environment.

## Responsibilities

The command should:

1. Verify that the current directory belongs to a Git worktree.
2. Determine the current worktree root.
3. Determine the repository's main worktree.
4. Locate `.agent-workspaces/` in the main worktree.
5. Read and validate `manifest.json`.
6. Verify every destination is safe.
7. Create required parent directories.
8. Create symlinks for every static overlay file.
9. Generate the worktree-specific `AGENTS.override.md`.
10. Report restored, unchanged, repaired, and conflicting paths.

## Locating the canonical overlay

The command must work when invoked from any linked worktree.

Conceptually:

```text
feature-worktree/
       │
       │ awso restore
       ▼
determine repository
       │
       ▼
find main worktree
       │
       ▼
main-worktree/.agent-workspaces/
```

The user should not need to specify where the main worktree lives.

## Restoring static files

Given:

```text
main/
└── .agent-workspaces/
    └── overlay/
        └── .codex/
            └── hooks/
                └── before-test
```

restore creates:

```text
feature/
└── .codex/
    └── hooks/
        └── before-test
            ↓ symlink
main/.agent-workspaces/overlay/.codex/hooks/before-test
```

The canonical file therefore exists once, while every worktree sees it at the location expected by the agent.

Changing the canonical hook immediately affects every restored worktree.

## Generating `AGENTS.override.md`

Unlike static overlay files, `AGENTS.override.md` must be generated from the current worktree.

Given:

```text
feature/AGENTS.md

+

main/.agent-workspaces/sources/AGENTS.extend.md
```

restore generates:

```text
feature/AGENTS.override.md
```

Conceptually:

```text
current worktree's AGENTS.md
             +
personal AGENTS.extend.md
             ↓
      AGENTS.override.md
```

This ensures that if two branches contain different versions of `AGENTS.md`, each worktree receives the correct corresponding override.

For example:

```text
main:
  AGENTS.md version A
      +
  AGENTS.extend.md
      ↓
  AGENTS.override.md A+

feature-x:
  AGENTS.md version B
      +
  AGENTS.extend.md
      ↓
  AGENTS.override.md B+
```

## Generated-file header

The generated file should include a clear ownership marker:

```markdown
<!--
GENERATED BY awso.
Do not edit this file directly.

Sources:
- AGENTS.md
- .agent-workspaces/sources/AGENTS.extend.md
-->
```

This marker serves two purposes:

1. It tells humans where the file came from.
2. It allows future `restore` operations to determine whether awso owns the existing file.

## Missing `AGENTS.md`

If the current worktree has no root `AGENTS.md`, restore should still be able to generate:

```text
AGENTS.override.md
```

from:

```text
.agent-workspaces/sources/AGENTS.extend.md
```

alone.

Example:

```text
No AGENTS.md found.
Generated AGENTS.override.md from personal extensions only.
```

## Destination safety

Restore must never silently overwrite arbitrary files.

For every manifest destination, the command should classify the existing state.

### Destination does not exist

Create the symlink.

```text
missing
  ↓
create symlink
```

### Correct awso symlink already exists

Do nothing.

```text
correct symlink
  ↓
unchanged
```

### Broken awso symlink

Repair it.

```text
broken known overlay symlink
  ↓
replace with correct symlink
```

### Symlink points somewhere else

Do not silently replace it unless awso can prove that it owns the link.

Prefer:

```text
CONFLICT: .codex/hooks/before-test

Existing symlink points to:
  /some/other/path

Expected:
  /repo/.agent-workspaces/overlay/.codex/hooks/before-test
```

### Regular untracked file exists

Do not overwrite it.

```text
CONFLICT: .codex/hooks/before-test

A regular file already exists at this location.
Workspace-overlay did not modify it.
```

### Git-tracked path exists

Treat this as a hard conflict.

```text
ERROR: .codex/hooks/before-test is tracked by Git.

Workspace-overlay will not shadow repository-owned files.
```

## Generated-file ownership

`AGENTS.override.md` is slightly different because awso generates it rather than symlinking it.

If the existing file contains the awso generation marker:

```text
generated by awso
  ↓
safe to regenerate
```

If an existing `AGENTS.override.md` does not contain that marker:

```text
unknown existing file
  ↓
CONFLICT
```

Workspace-overlay should leave it untouched.

## Atomic generation

When generating `AGENTS.override.md`, the command should preferably write to a temporary file and then atomically rename it into place.

Conceptually:

```text
generate temporary file
        ↓
validate
        ↓
atomic rename
        ↓
AGENTS.override.md
```

This prevents an interrupted restore from leaving a partially generated file.

## Idempotency

Restore should be safe to run as often as desired.

For an already healthy worktree:

```text
awso restore
```

might report:

```text
Workspace overlay restored.

Static overlay:
  4 unchanged
  0 created
  0 repaired
  0 conflicts

AGENTS.override.md:
  regenerated

Worktree is ready.
```

---

# 4. `awso status`

## Purpose

Inspects the current awso installation without modifying anything.

This command answers:

> Is awso correctly configured, and is this worktree currently hydrated as expected?

It should be completely read-only.

This makes it suitable for:

- troubleshooting,
- shell prompts,
- agent bootstrap checks,
- CI-like local validation,
- verifying a newly created worktree,
- checking whether `awso update` or `awso restore` needs to be run.

## Responsibilities

The command should:

1. Verify that the current directory belongs to a Git repository.
2. Identify the current worktree.
3. Identify the main worktree.
4. Locate `.agent-workspaces/`.
5. Validate the workspace directory structure.
6. Validate `manifest.json`.
7. Compare the manifest with the actual overlay contents.
8. Verify Git exclusions.
9. Check every expected symlink in the current worktree.
10. Check whether `AGENTS.override.md` exists and is awso-owned.
11. Detect whether `AGENTS.override.md` is stale.
12. Detect collisions with Git-tracked paths.
13. Make no filesystem changes.

## Example healthy output

```text
Workspace overlay status

Repository:
  /home/user/src/project

Current worktree:
  /home/user/src/project-feature

Main worktree:
  /home/user/src/project

Workspace:
  OK

Manifest:
  OK
  4 files

Git exclusions:
  OK

Static overlay:
  4 linked
  0 missing
  0 incorrect
  0 conflicts

AGENTS.override.md:
  OK

Status:
  healthy
```

## Detecting missing restoration

If a new worktree has not yet been restored:

```text
Workspace overlay status

Static overlay:
  0 linked
  4 missing

AGENTS.override.md:
  missing

Status:
  restore required

Run:
  awso restore
```

## Detecting stale metadata

If files have been added to:

```text
.agent-workspaces/overlay/
```

but `awso update` has not been run:

```text
Workspace overlay status

Manifest:
  OUT OF DATE

Unregistered overlay files:
  .codex/hooks/new-hook

Status:
  update required

Run:
  awso update
```

Likewise, if the manifest references a file that no longer exists:

```text
Manifest:
  OUT OF DATE

Missing overlay sources:
  .codex/hooks/old-hook

Run:
  awso update
```

## Detecting stale `AGENTS.override.md`

The command should determine whether the generated override still corresponds to:

```text
current AGENTS.md
+
current AGENTS.extend.md
```

This can be implemented by regenerating the expected content in memory and comparing it with the existing generated file.

If they differ:

```text
AGENTS.override.md:
  STALE

Sources changed since the override was generated.

Run:
  awso restore
```

This is particularly useful after:

```text
git switch ...
git pull
git rebase
```

because `AGENTS.md` may have changed even though the overlay symlinks remain valid.

## Detecting symlink problems

For every manifest file, status should distinguish:

```text
correct symlink
missing
broken symlink
incorrect symlink target
regular-file collision
tracked-file collision
```

For example:

```text
Static overlay:

  OK       .codex/hooks/before-test
  MISSING  .codex/hooks/after-edit
  WRONG    .my-agent/config.json
```

With optional detail:

```text
WRONG: .my-agent/config.json

Expected:
  /main/project/.agent-workspaces/overlay/.my-agent/config.json

Actual:
  /home/user/old-config.json
```

## Exit codes

`awso status` is especially useful if it exposes meaningful exit codes.

A simple convention could be:

```text
0  healthy
1  restore required
2  update required
3  conflict or invalid configuration
```

This allows scripts to do things such as:

```text
awso status || awso restore
```

More detailed exit codes can be introduced later if necessary, but the initial convention should remain simple.

## Read-only invariant

`awso status` must never:

- modify `info/exclude`,
- regenerate the manifest,
- create directories,
- create symlinks,
- repair symlinks,
- regenerate `AGENTS.override.md`.

Its job is only to describe reality.

---

# Ownership Model

The system maintains a clear distinction between three kinds of files.

## Repository-owned

Tracked by Git:

```text
AGENTS.md
src/
package.json
...
```

Workspace-overlay must never overwrite or shadow these paths.

## Workspace-owned shared files

Canonical files under:

```text
.agent-workspaces/overlay/
```

Examples:

```text
.codex/hooks/before-test
.codex/hooks/after-edit
.personal-agent/config.json
```

These are symlinked into worktrees.

Changes are intentionally shared between all worktrees.

## Workspace-owned generated files

Derived separately inside each worktree.

The main example is:

```text
AGENTS.override.md
```

Its contents depend on both shared personal configuration and tracked state belonging to that particular worktree.

---

# Typical Workflow

## Initial setup

```text
cd ~/src/project

awso setup
```

## Add personal agent instructions

Edit:

```text
.agent-workspaces/sources/AGENTS.extend.md
```

## Add static personal files

For example:

```text
.agent-workspaces/overlay/
└── .codex/
    └── hooks/
        └── before-test
```

Then synchronize the manifest:

```text
awso update
```

Restore the current worktree:

```text
awso restore
```

Verify:

```text
awso status
```

## Creating another worktree

```text
git worktree add ../project-feature -b feature
cd ../project-feature

awso restore
awso status
```

The resulting architecture is:

```text
                         MAIN WORKTREE

                    .agent-workspaces/
                   /         |          \
             sources/     overlay/     manifest
                |            |
       AGENTS.extend.md      hooks
                |            |
                |            +-----------------------+
                |                    symlinks         |
                |                                     |
                +------------+------------+           |
                             |            |           |
                             v            v           v
                           main        feature-a   feature-b
                             |            |           |
                         AGENTS.md     AGENTS.md    AGENTS.md
                             +            +           +
                           extend       extend      extend
                             |            |           |
                             v            v           v
                        AGENTS.override AGENTS.override AGENTS.override
                          generated      generated      generated
```

The important invariant is:

> Static personal configuration is shared between worktrees, while configuration derived from tracked repository state is generated independently for each worktree.

---

# Command Summary

## `awso setup`

Initializes awso for the repository.

It creates the canonical workspace structure and establishes the base local Git exclusions.

## `awso update`

Synchronizes the static overlay with the manifest and local Git exclusions.

Run this after adding, deleting, renaming, or moving files under:

```text
.agent-workspaces/overlay/
```

## `awso restore`

Hydrates the current worktree.

It creates symlinks for shared overlay files and generates the worktree-specific:

```text
AGENTS.override.md
```

## `awso status`

Performs a read-only health check.

It verifies:

```text
workspace structure
manifest
Git exclusions
overlay source files
worktree symlinks
AGENTS.override.md
tracked-file collisions
```

and tells the user whether `update` or `restore` is required.

## `awso help`

Prints the usage and a concise description of every available command.

It succeeds without requiring the current directory to be inside a Git repository.

Together, the commands provide a repeatable personal configuration layer over any Git worktree without committing developer-specific agent artifacts to the repository.
