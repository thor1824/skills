---
name: setup-matt-pocock-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; GitLab, Kata, and local markdown are also supported out of the box)
- **Triage labels**: the strings used for the five canonical triage roles
- **Domain docs**: where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- `.kata.toml` and `.codex/hooks.json`: whether this repo is already bound to Kata and has Kata's native Codex hooks
- Kata MCP tools: whether the connector is available and which projects are in its fixed startup scope. Kata remains a menu option when the connector is unavailable, but selecting it cannot complete until the connector is configured.
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section B runs at all.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `triage` isn't installed, Section C when there's no monorepo).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Kata**: issues live in the single project exposed by the Kata MCP connector. Setup requires the user to initialize the repo with Kata's native Codex hooks; agents perform issue operations through typed Kata MCP tools.
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

If the user chooses Kata, complete this branch before Section C:

1. Load Kata's project and issue-discovery MCP tools. Require exactly one project in the connector's startup scope and record its exact name. Stop on zero or multiple projects; do not guess or change the connector's scope.
2. Query the scoped project's labels before generating the contract. Labels are values already used on issues, not a registry of allowed values. If `triage` is installed, use these results in Section B as described below.
3. After resolving the triage mapping (or immediately when `triage` is not installed), inspect the existing binding and hooks using the verification rules below. A binding to another project is a conflict: stop without proposing `--replace` or `--reassign`. If the binding and hooks are already valid, report that and ask whether the user wants to skip initialization or rerun its idempotent setup. Otherwise, show the user this exact command with the resolved project name and ask them to run it themselves:

   ```sh
   kata init --project <exact-project-name> --with-codex-hooks
   ```

   Wait for confirmation. Do not run it for them. When initialization was already valid, rerun it only if the user chooses.
4. Verify without exposing unrelated configuration:
   - Root `.kata.toml` is a regular, non-symlink TOML file with `version = 1` and `[project].name` equal to the MCP project.
   - `.gitignore` contains the `.kata.local.toml` entry.
   - `.codex/hooks.json` is a regular, non-symlink JSON file. Under `hooks.SessionStart`, it contains exactly one `startup|resume|clear` group whose command is `kata attention-hook start --source kata-agent-hook-start`, and exactly one `startup|resume|clear|compact` group whose command is `kata agent-contract-hook --source kata-agent-contract-hook`. Each handler has a 10-second timeout and its Windows command counterpart. Preserve all unrelated hook groups.

   If initialization was required and any check still fails, stop and explain the incomplete setup instead of editing around it.
5. Run `kata quickstart --format contract`. This is the only CLI use besides the user-run initialization. Capture stdout verbatim; if the command fails or produces no contract, stop rather than inventing one.
6. Read `issue-tracker-kata.md`. Replace its project placeholder with the exact MCP project and its contract placeholder with the captured output. Use the result as the draft for `docs/agents/issue-tracker.md`.

The generated Kata guide makes the quickstart output authoritative for workflow and safety semantics, while its MCP adapter is authoritative for execution. Do not execute issue operations with the CLI merely because the captured contract shows CLI syntax.

**Section B: Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you), since an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.

For Kata, first present the labels already used in the scoped project. Automatically match exact canonical names, default missing roles to their canonical names, and suggest a noncanonical existing label only when its meaning clearly matches a role. The user still confirms the single five-role mapping question; never infer that an absent label is invalid.

**Section C: Domain docs.** Default to **single-context** (one `CONTEXT.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)

Let them edit before writing.

For Kata, the tracker draft includes the captured quickstart contract verbatim. Do not replace its CLI examples in place; the preceding adapter explains how agents execute those semantics through MCP.

On a rerun, treat existing `docs/agents/*.md` files as the baseline rather than rebuilding them blindly from the seed templates. Preserve confirmed triage-label overrides, domain choices, and user-authored tracker guidance unless the user changes them in the preview. For an existing Kata guide, refresh only the marked MCP-adapter and canonical-contract sections. If a Kata guide predates those markers, show a proposed migration and require confirmation before replacing any of its content.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa); always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section B ran. When it isn't, both are omitted.

Then write new docs files using the seed templates in this skill folder as a starting point. When a file already exists, update it in place according to the preservation rules above:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-kata.md](./issue-tracker-kata.md): Kata MCP issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): domain doc consumer rules + layout

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.
