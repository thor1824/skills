# Implementation plan: external-only Matt Pocock skills + Kata

**Revised:** 2026-09-07  
**Status:** Source-audited implementation plan; not an implemented or runtime-tested integration.  
**Supersedes:** The earlier plan, including its nonexistent `to-prd` work item and unsupported change estimates.

## 1. Audit basis and scope

This revision is based on reading all 18 engineering and all 7 productivity `SKILL.md` files, plus the supporting files cited below. The inspected upstream revisions are:

| Repository | Baseline |
| --- | --- |
| `mattpocock/skills` | [`3cca18b368ae95cdbdebbff572ccafa662551015`][matt-revision] |
| `kenn-io/kata` | [`905ff9b76ad3c10ac03cec8b2ded56790e0e4abe`][kata-revision] |

Source links in this document are pinned to those revisions rather than a moving `main`. Kata behavior was checked against its documentation; no Kata binary or local agent harness was run for this audit. Compatibility with the installed binary must be established during implementation.

The inventories and patch tables in section 6 cover the actual [engineering][engineering-tree] and [productivity][productivity-tree] directories. Other skill directories are **outside this audit and must not be installed by the initial external-only distribution** until inspected.

Throughout this plan, **upstream behavior** describes existing source. **Proposed changes** describe code, commands, configuration, and policies to build. In particular, `aw` is a proposed helper, not an existing Matt Pocock or Kata command.

## 2. Non-negotiable boundary

The target source repository must not acquire agent-owned configuration, memory, plans, reports, prototypes, scratch files, or task state. This applies to ignored files and temporary files too: writing an artifact and deleting it afterward does not satisfy the requirement.

Allowed changes are the actual product work requested by the user: source code, regression tests, migrations, and explicitly requested product documentation or runtime configuration. Intentional product commits and merge operations may update Git metadata. Planning and research must not create branches or Git metadata as a substitute for external storage.

Do not create target-repository `.kata.toml`, `AGENTS.md`, `CLAUDE.md`, `.agents/`, `docs/agents/`, `CONTEXT.md`, `.scratch/`, `.out-of-scope/`, local skill lockfiles, hooks, or workspace symlinks. Do not edit `.gitignore` to conceal artifacts. Existing files with those names are not automatically invalid: leave them alone and read relevant existing project standards when appropriate.

The skills fork itself contains the implementation source for this integration. That is legitimate product code. Its generated state and the user's KB still live outside the fork's checkout.

**Enforcement has two layers:** explicit skill instructions and path validation prevent normal mistakes; read-only repository access during planning prevents violations. A Markdown rule or a CLI wrapper alone is not a filesystem sandbox. The selected local agent harness must support the necessary external read/write permissions without repository-local setup.

## 3. Target design

### 3.1 Keep three responsibilities separate

| Responsibility | Proposed owner |
| --- | --- |
| Workflow, questioning, ticket slicing, testing and review discipline | Thin fork of the existing skills |
| Issue bodies, comments, labels, ownership, dependencies and completion | Kata |
| Glossaries, ADRs, research, rejected ideas and generated artifacts | Shared external filesystem |
| Project lookup, safe destinations and native Kata invocation | Small new `aw` helper |

Use a single logical project ID in the external registry, with an explicit mapping to the Kata project. Do not rely on the current working directory for storage destinations.

### 3.2 Proposed external layout

```text
~/agent-workspace/
  skills-src/                  # Fork checkout: source, not runtime state
  bin/                         # Installed aw executable
  config/
    projects.yaml
    contracts/
      workspace.md
      issue-tracker-kata.md
      domain.md
  projects/
    customer-portal/
      triage-labels.yaml
      knowledge/
        CONTEXT.md
        CONTEXT-MAP.md         # Only when multiple contexts are needed
        adr/
        contexts/<context>/
          CONTEXT.md
          adr/
        research/
        rejected/
        notes/
      artifacts/
        prototypes/
        reports/
        questionnaires/
        handoffs/
  global/
    knowledge/
  learning/<topic>/            # External workspaces for teach
  runtime/
    sessions/<session>/
    locks/
    tmp/
    private/                   # Secrets, never the general KB
  kata/                        # Optional explicit KATA_HOME
```

This layout is a proposal, not a directory structure found upstream. Make its root configurable, and refuse roots inside any registered source checkout or the skills checkout.

Kata documents a default home of `~/.kata`; the proposed `kata/` location is optional. Its configuration also permits database/server overrides. The integration must validate the effective configuration rather than assume setting `KATA_HOME` alone guarantees a local, isolated database. [Source][kata-config]

### 3.3 Preserve the existing spec model

The canonical output of `to-spec` should remain an **issue body in the configured tracker**, now Kata. The upstream skill already works that way. Do not introduce a mandatory separate Markdown spec or a parallel PRD workflow. Optional external exports must be marked as exports, with the authoritative issue reference. [Source][to-spec]

Keep durable supporting research and prototypes in the external filesystem and link them from the issue. Use actual Kata references, such as a qualified `project#short_id` returned by Kata, rather than introducing a second ticket-number scheme. [Source][kata-concepts]

## 4. New infrastructure to build

### 4.1 Safe user-level installation and bootstrap

Install the audited skills at user scope, not project scope. The upstream developer script targets `~/.claude/skills` and `~/.agents/skills`, but explicitly is not a supported installer; it also includes in-progress skills and can remove conflicting non-symlink destinations. Do not run it blindly as the installation solution. [Source][link-skills]

Add a separate safe installer that:

1. Installs only the 25 audited skills and their supporting files, preserving their names and invocation metadata.
2. Links or copies from the external fork checkout into the selected harness's user-level skill directory.
3. Refuses to overwrite unrelated installations; records its own installation manifest externally.
4. Configures external workspace access at user scope, with no target-repository files.
5. Verifies a fresh agent session can find the skills, execute `aw`, and read/write the external KB.

Keep the external contract in ordinary reference files rather than requiring one user-invoked skill to call another. Upstream distinguishes user-invoked skills from model-invoked skills; its own skill-mechanics guidance recommends ordinary shared reference files where appropriate. [Source][skill-mechanics]

Each adapted entrypoint that needs storage or project context must explicitly load the resolver output. Do not assume `setup-matt-pocock-skills` ran earlier in the same conversation. Pass the resolved project, checkout, contract and artifact paths to subagents too.

### 4.2 External project registry

Proposed schema:

```yaml
version: 1
projects:
  customer-portal:
    kata_project: customer-portal
    remotes:
      - github.com/acme/customer-portal
    checkouts:
      - /Users/me/code/customer-portal
```

KB and artifact paths are derived from the project ID and workspace root, not independently duplicated in every registry entry.

Resolution rules:

1. Use an explicit `--project` argument, then an explicit environment override.
2. Respect an explicitly registered checkout override where one exists.
3. Otherwise match a conservatively normalized Git remote against the registry.
4. Require explicit selection when unmatched or ambiguous; never silently create a project while reading.

Remote normalization should handle equivalent SSH/HTTPS spellings and a trailing `.git`, retain host and namespace, strip credentials, and avoid merging forks with upstream repositories. Preserve case and ports where meaningful. Path matching must use real paths and directory boundaries, not naive string prefixes. Multiple registered matches are an error, not permission to select arbitrarily.

Outside a Git checkout, `--project` must be sufficient for issue and KB access. Source-dependent operations additionally require an explicit checkout. A project can have multiple clones/worktrees, but none requires a binding file. Monorepo subproject selection must be explicit rather than guessed from a directory name.

### 4.3 Small helper, not another issue manager

Proposed interface:

```bash
aw context --json
aw --project customer-portal context --json
aw project register --project customer-portal --checkout /Users/me/code/customer-portal
aw --project customer-portal kata -- list --agent
aw --project customer-portal kata -- ready --unowned --label ready-for-agent --agent
aw path research
aw path scratch
aw kb search "authentication"
```

`aw context` returns structured project ID, Kata project, selected checkout or null, external contract paths, KB paths, artifact paths and session identity. `aw path` resolves a destination; allocation/writing is a separate, explicit operation.

`aw kata -- ...` forwards **native Kata arguments**. It injects the resolved project and session actor, validates local connection settings, uses an external working directory, and preserves exit codes. It must not reinvent issue IDs, dependencies, status, or a database. Reject nested project overrides and workspace-initialization commands in this interface. Handle global administrative operations separately rather than letting `--all` silently bypass project scoping.

Use structured subprocess arguments, not shell-string concatenation or `eval`. Translate input file paths to validated absolute paths before changing child-process working directory. Prefer JSON for programmatic parsing and agent output for human/agent reading.

### 4.4 External KB and artifact writes

Build one path-allocation/write module used by the helper and shared by generated workflows. It must:

- Reject traversal, unsafe project IDs and symlinks escaping an approved external root.
- Allocate unique session artifacts; use locking for shared sequential ADR/learning-record IDs.
- Write via temporary files in the destination directory and atomic replacement, with expected-content checks for updates.
- Read project knowledge first, then explicitly relevant global knowledge. Surface contradictions with current source code rather than treating old notes as unquestionable truth.
- Keep operational progress in Kata and secrets out of the KB; record provenance, issue reference and source revision where useful.

Keep upstream document formats where possible. `CONTEXT.md` stays a glossary, not a dumping ground for implementation plans. Index only the relevant knowledge in an agent's context rather than loading the entire shared folder.

## 5. Kata integration contract

### 5.1 Verified native operations

Kata documents explicit `--project`, `--as`, agent/JSON output, project creation without workspace bindings, and a printable agent contract. These are sufficient for an external resolver; no repository-local `.kata.toml` is required by this design. [CLI][kata-cli] / [Quickstart][kata-quickstart]

The following are **native Kata command forms**, with placeholder values supplied by the integration:

```bash
kata projects create "$PROJECT"
kata --project "$PROJECT" quickstart --format contract
kata --project "$PROJECT" --as "$ACTOR" ready --unowned --label ready-for-agent --agent
kata --project "$PROJECT" --as "$ACTOR" claim "$REF" --if-unowned --agent
kata --project "$PROJECT" --as "$ACTOR" show "$REF" --json
```

Run creation only during explicit registration. Do not use `kata init`, install Kata hooks, or request agent-file generation in the target repo. Load the dynamic contract from the installed binary and confirm it matches the integration's tested capabilities. [CLI][kata-cli]

### 5.2 Workflow policy added by this fork

**Creation:** search before creating; use stable idempotency keys for retryable creation. Store dependencies as native links, not only prose. [Agent guidance][kata-agents]

**Claiming:** assign a unique actor per worker/session. Ordinary repeated claims by the same actor can succeed as a no-op; a competitive worker should use the documented `--if-unowned` mode. Selection is not ownership: claim before implementation and retry selection on a lost race. Never force-claim by default. [CLI][kata-cli]

**Readiness:** combine the mapped `ready-for-agent` label with native blocker readiness and unowned filtering. Kata's structural readiness is based on open blockers, not proof that every closed blocker was successfully implemented. The fork should check required predecessor outcomes before proceeding. [Concepts][kata-concepts]

**Triage mapping:** preserve upstream category labels and its five state roles. Represent `wontfix` with the mapped label plus Kata's native close reason, rather than silently deleting a role from the upstream contract. Serialize/reconcile multi-step label transitions and verify the final state; do not claim separate label commands form an atomic transaction. [Upstream mapping][setup-labels] / [Kata state][kata-concepts]

**Completion:** run the actual verification before recording evidence. Kata accepts completion evidence; that is not a substitute for running tests. A decision/research ticket can reference reviewed external artifacts; it must not manufacture a product commit or test result. Leave incomplete work open with a durable comment. [Agent guidance][kata-agents]

**Parent protection:** preserve `to-tickets`' instruction not to close or modify the parent issue. Link tickets to their source, and use native child links where intended, without rewriting the parent's body/state. `wayfinder` separately owns its map updates. [Source][to-tickets]

For implementation, completion should attach the real commit and successful verification. For rejection, use the reason-specific close contract rather than reusing implementation evidence flags. Parent completion checks and close requirements must be exercised against the installed version. [Configuration][kata-config]

## 6. Exact upstream files and required changes

Paths below are relative to `mattpocock/skills`. Every skill name links to the inspected `SKILL.md`. Changes include descriptions, examples and referenced helper files where those can reintroduce repository-local writes.

### 6.1 Engineering inventory: 18 skills

| Existing skill | Observed upstream behavior | Proposed fork change |
| --- | --- | --- |
| [ask-matt][ask-matt] | Router descriptions include repository notes, scratch tickets and prototype branches. | Update those descriptions to the external workflow. Preserve routing and phase boundaries. |
| [code-review][code-review] | Expects tracker configuration in `docs/agents`; searches repository directories for specs. Reviews a pinned committed range. | Resolve tracker/spec externally; pass context to reviewers. Explicitly support the uncommitted implementation-review case described below. |
| [codebase-design][codebase-design] | Main file provides design methodology rather than artifact storage. | Keep main methodology. Adjust external-domain context injection in `DESIGN-IT-TWICE.md`. |
| [diagnosing-bugs][diagnosing-bugs] | Reads domain documents; may add instrumentation and create diagnostic harnesses/scripts. | Resolve KB externally. Put captures and harnesses outside; use an isolated external copy for throwaway source instrumentation. |
| [domain-modeling][domain-modeling] | Reads/writes root or per-context glossaries and ADRs, creating them lazily. | Preserve modeling discipline; replace paths in entrypoint and both format helpers. |
| [grill-with-docs][grill-with-docs] | Only composes `grilling` and `domain-modeling`. | No direct persistence rewrite. Verify composition receives the external domain context. |
| [implement][implement] | TDD, verification, review, then commit. No explicit claim/close lifecycle. | Add native Kata claim and evidence-bearing completion; keep existing implementation discipline. |
| [improve-codebase-architecture][improve-codebase-architecture] | HTML already goes to OS temp; glossary/ADR reads and updates remain repository-oriented. | Externalize knowledge access; validate temp destination is outside repos. Keep report methodology. |
| [prototype][prototype] | Uses nearby production context and a throwaway branch to preserve results. | Replace storage and branch workflow with external prototype workspaces; update UI/logic helpers too. |
| [research][research] | Produces a cited Markdown file using the repository's note-location convention. | Change destination and description to external research; propagate paths to its research agent. |
| [resolving-merge-conflicts][resolving-merge-conflicts] | Resolves actual product conflicts, tests, stages and completes Git operation. | No artifact redesign. Resolve issue references through the external contract; preserve unrelated dirty work when staging. |
| [setup-matt-pocock-skills][setup-matt-pocock-skills] | Scaffolds `docs/agents` contracts and edits an agent instruction file. | Replace repo scaffolding with external registration and validation; retain the skill name. |
| [tdd][tdd] | Reads domain context before the test-driven loop. | Replace knowledge lookup only. Keep behavior-focused testing and seam discipline. |
| [to-spec][to-spec] | Publishes a spec to the configured tracker with an agent-ready state. | Load external contracts and publish to Kata; preserve body structure and spec purpose. |
| [to-tickets][to-tickets] | Tracker-based vertical slicing with a repository-local Markdown fallback. | Use Kata only for persistence; remove the active local fallback while preserving slicing and parent protection. |
| [triage][triage] | Tracker workflow plus `.out-of-scope` rejected-enhancement memory. | Use Kata roles and external rejected knowledge; patch its two supporting documents. |
| [wayfinder][wayfinder] | Map/decision issues; local fallback; research-branch instructions. | Use Kata map graph and external artifacts; remove fallback and research/prototype branch instructions. |
| [wizard][wizard] | Generates a scratch/scripts wizard; may write `.env` and external service configuration. | Allocate script/private state externally; require explicit destinations and approvals for product or service writes. |

### 6.2 Supporting-file changes and important semantic details

#### Setup: replace the output location, not merely its introductory text

Modify `skills/engineering/setup-matt-pocock-skills/SKILL.md`, its [domain template][setup-domain], and active use of its [triage-label mapping][setup-labels]. Add a **new** Kata contract template under the integration source directory. Keep legacy tracker templates available upstream, but do not select the [local tracker template][setup-local] in external-only mode.

Upstream setup configures where domain documents live; it does not itself necessarily generate every glossary and ADR directory. The replacement should register the project and external contracts, validate Kata, and let knowledge files be created lazily. No generated pointer is needed in the source repo.

#### Domain modeling: update both format references

Patch [CONTEXT-FORMAT.md][context-format] and [ADR-FORMAT.md][adr-format] as well as the entrypoint. Their examples and placement rules otherwise retain repository-root and `src/<context>` assumptions.

Map per-context knowledge to `projects/<id>/knowledge/contexts/<context>/`. Resolve links relative to that knowledge tree. Preserve the glossary format and the threshold for recording ADRs. Replace uncoordinated "highest number plus one" allocation with the shared write helper when multiple agents can create records concurrently.

#### Triage: preserve its decision discipline

Patch [OUT-OF-SCOPE.md][out-of-scope] so rejected concepts live in external `knowledge/rejected/`. Preserve concept-oriented entries and prior-request history. Do not turn bugs, deferred work, or already-implemented features into rejection entries.

Patch [AGENT-BRIEF.md][agent-brief] so its tracker-specific wording and examples use Kata and external references. Preserve durable, actionable briefs and the triage AI disclosure. GitHub/GitLab pull-request triage is not automatically supplied by Kata; retain it only through an explicitly configured separate integration, not a fabricated Kata PR command.

#### Implementation and review: make the review scope real

`implement` asks for review before its final commit; `code-review` defaults to a committed range ending at `HEAD`. Connecting them without addressing this can review the wrong changes. [Implementation][implement] / [Review][code-review]

Add an explicit implementation-review mode that includes the intended uncommitted diff. Keep the existing pinned-range behavior for standalone committed reviews. Record the review scope outside the repo, and exclude unrelated pre-existing edits. Commit only the intended product work; attach actual verification results to the claimed issue afterward.

A failed verification, interrupted session or unresolved review finding leaves the issue open. Record a useful handoff, and release ownership only using an ownership-checked operation when the workflow requires it.

#### Wayfinder: remove its independent branch instructions

Modify the **Chart** research dispatch and **Walk** workflow, not only generic tracker loading. The existing research-agent brief explicitly asks for research branches; redirect it to external research artifacts. Keep its map/decision distinction, decision-type labels and human decision gates. [Source][wayfinder]

For a selected map, filter candidates to its children as well as checking readiness. Do not invent a `kata ready --parent` flag. Implement filtering using the installed version's actual structured relationship output. Serialize map-summary updates among cooperating workers; reread before writing. Do not claim that a local helper lock protects edits made through every other Kata client.

#### Prototype: this is a real behavioral change

Patch the entrypoint plus [UI.md][prototype-ui] and [LOGIC.md][prototype-logic]. Preserve comparative exploration, but remove instructions to place variants beside production files, change production routes for exploration, or archive them on throwaway branches.

Use a standalone external harness where adequate. When realistic UI exploration needs the application, create a disposable **non-Git copy** under external prototypes, recording the source revision and any explicitly included working-tree changes. No hardlinks or writable symlinks back into the source checkout. Keep installs, caches and experimental databases in that copy or external runtime directories.

Do not substitute a linked Git worktree for this strict isolation mode: Git documents shared repository data and administrative files for linked worktrees. [Git worktree documentation][git-worktree]

This sacrifices some of upstream's close-to-production convenience. State fidelity limitations instead of pretending every prototype can be a standalone HTML file. The chosen design becomes an input to a separately authorized implementation step, not an automatic copy-back.

#### Research, architecture reports and debugging

For `research`, change both its description and the output instruction. For architecture review, the HTML destination is **already external by default**; patch knowledge resolution and validate the chosen temp root rather than alleging a repository-local report bug. Check the [HTML report helper][html-report] for the same destination wording.

For debugging, preserve actual regression tests and fixes in the product repo, but put temporary instrumentation in the isolated external copy. Captured traces, browser scripts and copied [human-in-the-loop templates][hitl-template] go to external scratch. Redact credentials before retaining diagnostic evidence.

The behavior-focused examples in [TDD tests][tests], [mocking guidance][mocking] and [deepening guidance][deepening] do not need a storage rewrite. In [DESIGN-IT-TWICE.md][design-twice], supply the externally resolved glossary to design subagents rather than assuming a root `CONTEXT.md`.

#### Wizard: account for its template defaults

The [wizard template][wizard-template] defaults `ENV_FILE` to `.env` and uses temporary files while upserting values. Launch generated scripts with a validated absolute external `ENV_FILE`, an external temp directory, restrictive permissions and an external working directory. Set an explicit remote-repository target for approved GitHub operations so changing working directory does not change their target.

Keep the template's reusable library intact where environment configuration is enough. Generated stages must not quietly `cd` into the source repo and write files. Actual product `.env` changes, repeatable scripts intended as product deliverables, and remote configuration changes require explicit task authorization. Secrets belong in private storage, never project research, handoffs or issue comments.

### 6.3 Productivity inventory: 7 skills

These must be included in the boundary audit because the router can point users toward them.

| Existing skill | Observed upstream behavior | Proposed fork change |
| --- | --- | --- |
| [grill-me][grill-me] | Composes `grilling`. | No persistence change. |
| [grilling][grilling] | Conversational interrogation and fact gathering. | Keep method; propagate resolved context when delegating project research. |
| [handoff][handoff] | Already writes to OS temp, explicitly not the current directory. | Validate external destination; prefer external handoffs for durable sharing and include project/issue references. |
| [teach][teach] | Maintains learning documents and artifacts in its workspace. | Make that an explicit external learning workspace, never implicitly the source checkout. |
| [to-questionnaire][to-questionnaire] | Saves `to-questionnaire-<slug>.md` in the current directory. | Save under the external questionnaires destination. |
| [wait-what][wait-what] | Uses the domain glossary/context map while clarifying confusion. | Resolve those through the external KB contract. |
| [writing-for-agents][writing-for-agents] | General guidance for authoring agent instructions. | Keep guidance. When applied to project agent setup, its output target must be external. |

For `teach`, interpret [MISSION-FORMAT.md][mission-format], [RESOURCES-FORMAT.md][resources-format] and [LEARNING-RECORD-FORMAT.md][learning-format] relative to the selected external learning root. Keep lessons, HTML references, assets, notes and records together. Protect sequential record allocation just like ADR allocation. Teaching product code intentionally is a separate source-editing task.

Update `ask-matt` descriptions of these destinations; its [PHASE-BOUNDARIES.md][phase-boundaries] can retain the existing conceptual handoffs. Preserve the ordinary authored-work sequence `to-spec -> to-tickets -> implement`; do not insert triage unnecessarily between already-prepared tickets and implementation. Triage remains the incoming-report workflow.

## 7. Implementation work packages

All paths in the **new deliverables** column are proposed additions, not existing upstream files.

| Order | Work package | New deliverables / existing changes | Acceptance gate |
| --- | --- | --- | --- |
| 1 | Pin baseline and enumerate installation scope | `integrations/external-workspace/audit-manifest.json`; record the 25 entrypoints and their helper dependencies. | Every installed entrypoint exists at the recorded revision; unsupported buckets excluded. |
| 2 | Build resolver and safe installer | New `integrations/external-workspace/` implementation, registry schema, safe user-level installer and contract templates. | Fresh session resolves a registered clone and explicit project outside a repo without creating local files. |
| 3 | Prove Kata routing | Native argument forwarding, version/capability check, session actors and explicit registration. | Two checkouts see one project; competing claim test passes using an isolated local Kata home. |
| 4 | Build external storage primitives | Validated destinations, KB retrieval, guarded updates, locks and external scratch allocation. | Traversal/symlink tests fail safely; concurrent ADR creation preserves both records. |
| 5 | Adapt the primary workflow | Setup, domain modeling, to-spec, to-tickets, implement, code-review; associated helpers and router. | One spec becomes Kata tickets and verified product work without coordination files in the repo. |
| 6 | Adapt remaining writers and consumers | Triage, wayfinder, prototype, research, debugging, architecture review, wizard, productivity and remaining context reads. | Each installed workflow passes its destination and context-propagation tests. |
| 7 | Enforce and release | Harness permissions, end-to-end fixtures, upstream-change audit and documentation. | All checks below pass; release records both upstream and tested Kata versions. |

Do not postpone safe file allocation until after skill patching: the skills need a dependable destination contract to call. Do not add vector search, a custom issue database, cloud synchronization, or an orchestration daemon to this first implementation.

## 8. Verification plan

### 8.1 Repository cleanliness must mean more than status text

The earlier plan's before/after `git status` comparison was insufficient. Git status normally omits ignored files, and identical status markers do not prove a dirty file's bytes stayed unchanged. Git also documents that ordinary status can refresh the index; use `git --no-optional-locks status` for read-only inspection. [Git status documentation][git-status]

For planning-only tests, run with the target checkout and its Git metadata read-only where the harness permits. Store test snapshots externally. Compare path inventories, contents, symlink targets, relevant modes, index state, refs and local Git configuration against the baseline. Include ignored and untracked paths. Use write monitoring or denied-write evidence to catch temporary-write-then-delete behavior that final snapshots cannot detect.

For implementation tests, allow only authorized product changes and the associated intentional Git operations. Preserve unrelated dirty files and staging. Never use cleanup commands to erase the user's work or hide a failed cleanliness test.

Builds and test runners may have their own generated output. Configure caches, logs and reports externally. If a tool cannot run without non-product files in the source checkout, run it against the isolated external copy and explicitly report what was verified there. Do not silently exempt package-manager or test artifacts from the user's rule.

### 8.2 Required tests

| Test | Required result |
| --- | --- |
| New session, no repo agent files | User-level skills and the external contract are discovered; no bootstrap file appears in the checkout. |
| Same project, two clones and an existing worktree | Each resolves to the same configured Kata project and KB. |
| Outside any repository | Explicit project supports issues/knowledge; source tasks require a selected checkout. |
| Unknown or ambiguous project | Clear error; no guessed namespace, generated config or new Kata project. |
| Source tree already dirty | Read-only workflows preserve exact contents, staged state and untracked/ignored files. |
| Escaping path or symlink | KB/artifact writes outside approved external roots are refused. |
| Parallel workers | Only the successful claimant implements; no force-claim fallback; same-actor collision behavior is tested too. |
| Interrupted write or label transition | Existing document remains intact; issue transition is reported/reconciled, not falsely treated as atomic. |
| Concurrent ADRs/learning records | Unique IDs and no lost records; conflicting glossary updates are surfaced. |
| to-spec / to-tickets | Canonical spec and child work are in Kata; retry does not duplicate tickets; parent body/state remains unchanged. |
| implement / code-review | Intended uncommitted work is actually reviewed; real tests run; unrelated changes are not staged. |
| triage | Category/state rules hold; only qualifying rejected enhancements update external rejected knowledge. |
| wayfinder | Selection is map-specific; no research branches or local ticket fallback; decisions link external evidence. |
| prototype | No source-route edits, temporary source files or prototype refs; outputs and dependencies remain external. |
| research / questionnaire / teach | All outputs land in their allocated external roots, including delegated-agent output. |
| architecture review / handoff | Temp location is validated even when the environment's temp variable points into a repo. |
| wizard | Script, temp file and private values remain external; remote targets and product writes are explicitly authorized. |
| Independent context consumers | Direct invocation of TDD, review, debugging and wait-what works without a prior setup conversation. |
| Global/project knowledge conflict | Project-specific definitions are scoped correctly; stale evidence and source-code contradictions are reported. |
| Permission denial or unavailable Kata | Stop safely; never fall back to repository files or claim successful persistence. |

Keep all test fixtures, fake homes, logs and reports outside the target source fixture. An end-to-end test must assert that path as well as the resulting workflow behavior.

## 9. Fork and upstream-update policy

Use a real fork with an `upstream` remote. Keep custom implementation and contracts under one integration directory; keep skill-name changes out of scope. Separate commits into installer/resolver, storage, tracker wiring, workflow changes and tests.

The fork is thin in **responsibility**, not necessarily in the number of files touched. Storage assumptions appear in entrypoints, descriptions, templates, subagent briefs and router summaries. The earlier percentage and line-count estimates were not based on an implementation diff and should not be used for planning.

Before accepting an upstream update:

1. Review changed entrypoints and helper files, including newly added skills.
2. Reconcile the explicit file-level changes in section 6 rather than applying blanket text replacement.
3. Inspect instructions mentioning output paths, branch creation, current-directory writes, setup, temporary scripts and generated files. Distinguish reading legitimate source files from writing agent artifacts.
4. Run the external-only integration tests before updating the installed skills.
5. Record the new source revision and tested Kata version in the external installation manifest.

Keep legacy upstream templates dormant rather than deleting them unnecessarily. Tests must prove that the external-only workflow cannot select them as fallback. Do not automatically enable newly added upstream skills before auditing their write behavior.

## 10. Definition of done and first usable milestone

**First usable milestone:** safe user-level discovery, external project resolution, native Kata access, guarded KB writes, and the complete `to-spec -> to-tickets -> implement -> code-review` path, tested across two checkouts. No target-repo setup files or planning artifacts may appear.

**Full completion:** every installed skill in section 6 and its reachable helpers obeys the external-only contract; concurrent agents share issue/knowledge state safely; planning runs cannot write to the source repo; product workflows preserve unrelated work; and the upstream-update gate catches new storage assumptions.

This is broader than changing `.scratch` to another directory, but does not require building a replacement for Kata. The core work is external context resolution, reliable file boundaries, and explicit corrections to the real upstream workflows.

### Remaining implementation validations

The local agent harness has not been selected or tested here. Confirm its user-level discovery, external-folder permissions, subagent inheritance and enforcement capabilities before claiming a hard no-write guarantee. Confirm installed Kata behavior against the documented baseline, including local connection selection, claims and completion evidence. UI-prototype fidelity in an external copy must be tested with an actual project.

No implementation, installation, source-repository mutation or runtime integration test is claimed by this document.

<!-- Commit-pinned source references used inline above. -->

[adr-format]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/ADR-FORMAT.md
[agent-brief]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/triage/AGENT-BRIEF.md
[ask-matt]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/ask-matt/SKILL.md
[code-review]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/code-review/SKILL.md
[codebase-design]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/SKILL.md
[context-format]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/CONTEXT-FORMAT.md
[deepening]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/DEEPENING.md
[design-twice]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/DESIGN-IT-TWICE.md
[diagnosing-bugs]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/diagnosing-bugs/SKILL.md
[domain-modeling]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/SKILL.md
[engineering-tree]: https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering
[git-status]: https://git-scm.com/docs/git-status
[git-worktree]: https://git-scm.com/docs/git-worktree
[grill-me]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/grill-me/SKILL.md
[grill-with-docs]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/grill-with-docs/SKILL.md
[grilling]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/grilling/SKILL.md
[handoff]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/handoff/SKILL.md
[hitl-template]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/diagnosing-bugs/scripts/hitl-loop.template.sh
[html-report]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/improve-codebase-architecture/HTML-REPORT.md
[implement]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/implement/SKILL.md
[improve-codebase-architecture]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/improve-codebase-architecture/SKILL.md
[kata-agents]: https://github.com/kenn-io/kata/blob/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe/docs/workflows/agents.md
[kata-cli]: https://github.com/kenn-io/kata/blob/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe/docs/reference/cli.md
[kata-concepts]: https://github.com/kenn-io/kata/blob/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe/docs/guide/concepts.md
[kata-config]: https://github.com/kenn-io/kata/blob/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe/docs/reference/configuration.md
[kata-quickstart]: https://github.com/kenn-io/kata/blob/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe/docs/get-started/quickstart.md
[kata-revision]: https://github.com/kenn-io/kata/commit/905ff9b76ad3c10ac03cec8b2ded56790e0e4abe
[learning-format]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/teach/LEARNING-RECORD-FORMAT.md
[link-skills]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/scripts/link-skills.sh
[matt-revision]: https://github.com/mattpocock/skills/commit/3cca18b368ae95cdbdebbff572ccafa662551015
[mission-format]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/teach/MISSION-FORMAT.md
[mocking]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/tdd/mocking.md
[out-of-scope]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/triage/OUT-OF-SCOPE.md
[phase-boundaries]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/ask-matt/PHASE-BOUNDARIES.md
[productivity-tree]: https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity
[prototype]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/prototype/SKILL.md
[prototype-logic]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/prototype/LOGIC.md
[prototype-ui]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/prototype/UI.md
[research]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/research/SKILL.md
[resolving-merge-conflicts]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/resolving-merge-conflicts/SKILL.md
[resources-format]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/teach/RESOURCES-FORMAT.md
[setup-domain]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/setup-matt-pocock-skills/domain.md
[setup-labels]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/setup-matt-pocock-skills/triage-labels.md
[setup-local]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md
[setup-matt-pocock-skills]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/setup-matt-pocock-skills/SKILL.md
[skill-mechanics]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/writing-for-agents/SKILL-MECHANICS.md
[tdd]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/tdd/SKILL.md
[teach]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/teach/SKILL.md
[tests]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/tdd/tests.md
[to-questionnaire]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/to-questionnaire/SKILL.md
[to-spec]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/to-spec/SKILL.md
[to-tickets]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/to-tickets/SKILL.md
[triage]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/triage/SKILL.md
[wait-what]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/wait-what/SKILL.md
[wayfinder]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/wayfinder/SKILL.md
[wizard]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/wizard/SKILL.md
[wizard-template]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/wizard/template.sh
[writing-for-agents]: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/writing-for-agents/SKILL.md
