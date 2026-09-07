# Plan: External Agent Workspace for Matt Pocock Skills + Kata

## 1. Goal

Adapt the Matt Pocock skills repository so that all agent coordination, planning, issue state, knowledge, and generated workflow artifacts live **outside the working source repository**.

The source repository should contain only product/source changes that are part of the actual task.

The intended architecture is:

- **Matt Pocock skills** provide workflow and engineering discipline.
- **Kata** provides centralized local issue management.
- **A shared local knowledge base** provides durable project and global knowledge.
- **An external project resolver** maps the current repository/worktree to the correct Kata project and knowledge namespace.
- **No agent-owned artifact is written into the source repository.**

---

## 2. Core Invariant

Using the agent workflow must not modify the repository unless the requested task itself requires a source/product change.

Examples of files or directories that must **not** be created in the repository:

- `.kata.toml`
- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- `.scratch/`
- `.out-of-scope/`
- planning files
- generated specs
- generated PRDs
- research notes
- issue files
- task logs
- agent state
- temporary workflow artifacts

### Acceptance test

If an agent only:

- resolves project context,
- reads issues,
- creates issues,
- updates issues,
- creates a spec,
- writes research,
- updates the knowledge base,

then:

```bash
git status --short
```

must remain unchanged.

---

## 3. High-Level Architecture

```text
                        +----------------------+
                        | Matt Pocock Skills   |
                        |                      |
                        | grill / spec /       |
                        | tickets / triage /   |
                        | implement / review   |
                        +----------+-----------+
                                   |
                         External Workspace API
                                   |
                 +-----------------+-----------------+
                 |                                   |
                 v                                   v
              Kata                              Knowledge Base
           issue state                          durable memory
                 |                                   |
                 v                                   v
            ~/.kata/...                 ~/agent-workspace/knowledge/
                 ^
                 |
          Project Resolver
                 ^
                 |
          Current Git Repository
          (source/product only)
```

---

## 4. External Workspace Layout

Recommended structure:

```text
~/agent-workspace/
|
|-- config/
|   |-- projects.yaml
|
|-- knowledge/
|   |-- global/
|   |   |-- architecture/
|   |   |-- engineering/
|   |   |-- glossary/
|   |   |-- patterns/
|   |   `-- research/
|   |
|   `-- projects/
|       |-- customer-portal/
|       |   |-- CONTEXT.md
|       |   |-- adr/
|       |   |-- specs/
|       |   |-- prd/
|       |   |-- research/
|       |   |-- rejected/
|       |   `-- notes/
|       |
|       `-- payments-api/
|           `-- ...
|
`-- state/
    `-- optional transient agent-local state
```

Kata remains external under its own home:

```text
~/.kata/
```

or another configured `KATA_HOME`.

---

## 5. Project Resolution

The key missing layer is resolving the current repository or worktree to:

1. a logical project,
2. a Kata project,
3. a project knowledge directory.

No pointer file should be written into the repo.

### Resolution precedence

Use:

1. Explicit CLI project override.
2. Environment variable override.
3. Normalized Git remote identity.
4. External absolute-path mapping.
5. Fail with a clear "project not registered" error.

### Preferred identity

Use the normalized Git remote as the primary key.

Example:

```text
git@github.com:acme/customer-portal.git
```

normalizes to:

```text
github.com/acme/customer-portal
```

This allows multiple clones and worktrees to resolve to the same project automatically.

### Example registry

```yaml
projects:
  github.com/acme/customer-portal:
    project: customer-portal
    kata_project: customer-portal
    knowledge: ~/agent-workspace/knowledge/projects/customer-portal

  github.com/acme/payments:
    project: payments
    kata_project: payments
    knowledge: ~/agent-workspace/knowledge/projects/payments

paths:
  /opt/internal/unusual-checkout:
    project: internal-tools
```

---

## 6. External Workspace CLI

Introduce a thin local command-line wrapper.

Working name:

```text
agent
```

Its purpose is **not** to replace Kata.

It should provide:

- project resolution,
- stable commands for skills,
- knowledge access,
- Kata routing.

### Project commands

```bash
agent project
agent project show
agent project register
agent project resolve
```

Example:

```bash
cd ~/code/customer-portal
agent project
# customer-portal
```

### Issue commands

These should delegate to Kata.

```bash
agent issue list
agent issue ready
agent issue next
agent issue show <id>
agent issue search "<query>"
agent issue create ...
agent issue claim <id>
agent issue comment <id>
agent issue close <id>
agent issue relate ...
```

The wrapper should inject the resolved Kata project automatically.

### Knowledge commands

```bash
agent kb root
agent kb search "<query>"
agent kb read <path>
agent kb create <type> <title>
agent kb related <issue>
```

Potential knowledge types:

```text
adr
spec
prd
research
rejected
note
glossary
```

---

## 7. Kata Responsibilities

Kata should own all mutable operational work state.

Use Kata for:

- issues
- issue IDs
- status
- priorities
- labels
- ownership
- claims
- dependencies
- blocking relationships
- parent/child relationships
- comments
- progress
- history
- close reasons
- commit evidence
- test evidence
- agent-ready queues

Do **not** duplicate these into Markdown files.

### Example lifecycle

```bash
agent issue ready --label ready-for-agent
agent issue claim CP-42

# implementation work

agent issue comment CP-42   --body "Implemented validation and added tests."

agent issue close CP-42   --done   --commit "$(git rev-parse HEAD)"   --test "pnpm test"
```

---

## 8. Knowledge Base Responsibilities

The shared filesystem knowledge base should hold durable knowledge rather than operational state.

Use it for:

- glossary/domain language
- ADRs
- specs
- PRDs
- research
- architecture notes
- reusable engineering knowledge
- rejected product ideas
- long-form planning artifacts
- historical context worth preserving

### Scope model

Use two knowledge scopes.

#### Global

```text
~/agent-workspace/knowledge/global/
```

For:

- reusable engineering patterns,
- shared terminology,
- company-wide architecture knowledge,
- research applicable to many projects.

#### Project

```text
~/agent-workspace/knowledge/projects/<project>/
```

For:

- project-specific domain definitions,
- architecture,
- ADRs,
- specs,
- rejected ideas,
- research,
- historical decisions.

### Precedence rule

Project knowledge always overrides global knowledge where they conflict.

---

## 9. Linking Kata and Knowledge

Issues and long-form artifacts should reference each other.

Example spec:

```markdown
---
title: Passkey Authentication
project: customer-portal
related_issues:
  - CP-42
  - CP-43
---

# Passkey Authentication

...
```

A Kata issue may contain:

```text
Spec:
~/agent-workspace/knowledge/projects/customer-portal/specs/passkeys.md
```

The wrapper may later introduce logical references such as:

```text
kb://customer-portal/specs/passkeys
```

Avoid requiring this in v1.

---

## 10. Changes to the Matt Pocock Skills Fork

Maintain a thin fork.

The upstream repository should remain the main source of workflow improvements.

### Principle

> Skills own workflow policy.  
> External adapters own storage, project resolution, and infrastructure.

Avoid teaching every skill about filesystem layout or Kata internals.

---

## 11. Skills to Modify

### 11.1 setup-matt-pocock-skills

This requires the largest conceptual change.

Current repo-oriented setup behavior should be replaced or supplemented with external workspace registration.

New behavior:

1. Detect current Git repository.
2. Normalize Git remote identity.
3. Resolve external registry entry.
4. If missing, register the project externally.
5. Ensure corresponding Kata project exists.
6. Ensure project knowledge directory exists.
7. Do not create files in the repo.
8. Verify repository cleanliness after setup.

Potential rename in the fork:

```text
setup-agent-workspace
```

or keep the original name for upstream compatibility.

### 11.2 to-tickets

Keep the ticket slicing logic.

Change only issue persistence.

Before:

```text
.scratch/<feature>/issues/*.md
```

After:

```text
agent issue create ...
```

Use:

- parent issues,
- blocker relationships,
- labels,
- idempotency,
- search-before-create.

### 11.3 triage

Map Matt's logical states to Kata labels and close reasons.

Suggested mapping:

| Workflow state | Kata representation |
|---|---|
| bug | label |
| enhancement | label |
| needs-triage | label |
| needs-info | label |
| ready-for-agent | label |
| ready-for-human | label |
| wontfix | Kata close reason |

Rejected product ideas should be stored in:

```text
~/agent-workspace/knowledge/projects/<project>/rejected/
```

not:

```text
.out-of-scope/
```

### 11.4 implement

Add issue lifecycle semantics:

1. Resolve ticket.
2. Claim it atomically.
3. Implement.
4. Test.
5. Review.
6. Commit.
7. Close with evidence.
8. If incomplete, comment and leave open.

Never force-claim another agent's issue unless explicitly requested.

### 11.5 to-spec

Store generated specs externally.

Preferred destination:

```text
~/agent-workspace/knowledge/projects/<project>/specs/
```

Create or update a corresponding Kata parent issue if appropriate.

### 11.6 to-prd

Store generated PRDs under:

```text
~/agent-workspace/knowledge/projects/<project>/prd/
```

No PRD artifact should appear in the source repo.

### 11.7 wayfinder

Use Kata for:

- parent planning issue,
- decision tickets,
- blocker relationships,
- related issues,
- durable comments.

Long-form reasoning that deserves preservation should live in the KB.

### 11.8 domain-modeling

Change only storage destinations.

Instead of:

```text
CONTEXT.md
docs/adr/
```

use:

```text
~/agent-workspace/knowledge/projects/<project>/CONTEXT.md
~/agent-workspace/knowledge/projects/<project>/adr/
```

Keep the domain-modeling logic itself unchanged.

### 11.9 research

Write research to:

```text
~/agent-workspace/knowledge/projects/<project>/research/
```

or:

```text
~/agent-workspace/knowledge/global/research/
```

depending on scope.

---

## 12. Skills Expected to Stay Unchanged

Avoid unnecessary divergence from upstream.

Likely unchanged:

- `tdd`
- `codebase-design`
- `diagnosing-bugs`
- `code-review` core methodology
- `resolving-merge-conflicts`
- `prototype`

Any skill that only reasons about source code and does not persist workflow state should remain untouched.

---

## 13. Repository Cleanliness Guard

Add a reusable guard in the external CLI.

Before a workflow:

```bash
git status --porcelain
```

Capture the initial state.

After non-source workflow actions:

```bash
git status --porcelain
```

The result must be identical.

For implementation tasks, changes are allowed only where they correspond to requested source/product modifications.

Optional command:

```bash
agent repo assert-no-agent-artifacts
```

It should fail if it finds known forbidden artifacts such as:

```text
.kata.toml
.scratch/
.out-of-scope/
CONTEXT.md
agent-generated planning files
```

unless explicitly allowlisted as legitimate project files.

---

## 14. Upstream Fork Strategy

Fork:

```text
mattpocock/skills
```

Add upstream:

```bash
git remote add upstream https://github.com/mattpocock/skills.git
```

Regular update flow:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

or rebase if preferred.

### Keep custom changes isolated

Prefer focused commits such as:

```text
1. add external project resolver integration
2. add Kata issue adapter
3. add external KB adapter
4. make setup repo-clean
5. adapt to-tickets to Kata
6. adapt triage lifecycle
7. adapt implement claim/close semantics
8. move knowledge-producing workflows external
```

This keeps conflict resolution manageable.

---

## 15. Implementation Phases

### Phase 1 - External project resolver

Build:

- Git repo detection
- normalized remote identity
- YAML registry
- path fallback
- project lookup
- external project registration

Deliverable:

```bash
cd <any registered clone/worktree>
agent project
```

returns the same logical project.

### Phase 2 - Kata adapter

Build wrappers for:

- list
- show
- search
- create
- claim
- ready
- comment
- relate
- close

Deliverable:

```bash
agent issue ready
```

works without `.kata.toml` in the repo.

### Phase 3 - Knowledge adapter

Build:

- project KB resolution
- global KB resolution
- search
- read
- create
- standard directory layout

Deliverable:

```bash
agent kb root
agent kb search "authentication"
```

work from any registered clone/worktree.

### Phase 4 - Fork setup integration

Modify setup so that it:

- registers the project externally,
- ensures Kata project exists,
- ensures KB directories exist,
- writes nothing into repo,
- verifies clean Git state.

### Phase 5 - Issue-producing skills

Adapt:

- `to-tickets`
- `triage`
- `implement`
- `wayfinder`

### Phase 6 - Knowledge-producing skills

Adapt:

- `to-spec`
- `to-prd`
- `domain-modeling`
- `research`

### Phase 7 - Integration tests

Test against:

1. normal clone,
2. Git worktree,
3. second clone of same repo,
4. unrelated repo,
5. dirty working tree,
6. multiple agents claiming work,
7. missing registry mapping,
8. KB project/global precedence.

---

## 16. Key Integration Tests

### Test A - No artifact creation

```bash
git status --porcelain > /tmp/before

agent project
agent issue list
agent kb search "foo"

git status --porcelain > /tmp/after

diff /tmp/before /tmp/after
```

Expected:

```text
no difference
```

### Test B - Same remote, different checkout

```text
~/src/customer-portal
~/worktrees/customer-passkeys
/tmp/customer-debug
```

All should resolve to:

```text
customer-portal
```

if they share the same normalized origin.

### Test C - Shared issue state

Agent A:

```bash
agent issue claim CP-42
```

Agent B:

```bash
agent issue claim CP-42
```

Expected:

- Agent A succeeds.
- Agent B is refused because ownership is already taken.

### Test D - Shared knowledge

Agent A writes:

```text
knowledge/projects/customer-portal/adr/001-auth.md
```

Agent B from another worktree can immediately retrieve it through:

```bash
agent kb search "auth"
```

### Test E - Project overrides global

Global:

```text
Account = authenticated identity
```

Project:

```text
Account = billing relationship
```

Expected:

The project definition is used while working on that project.

---

## 17. Non-Goals for v1

Do not build these initially:

- vector database
- semantic embeddings
- web dashboard
- custom issue database
- replacement for Kata
- background scheduler
- autonomous orchestration daemon
- complex graph database
- remote/cloud synchronization
- custom agent protocol

Start with:

```text
Kata + filesystem KB + thin resolver/adapter
```

and add complexity only when usage proves it necessary.

---

## 18. Future Extensions

Possible later additions:

### SQLite KB index

Keep Markdown as source of truth but build a local search index.

### Full-text search

Use ripgrep, SQLite FTS, or another lightweight local index.

### Semantic search

Add only if keyword and metadata search become insufficient.

### Artifact URI scheme

Example:

```text
kb://customer-portal/adr/001-auth
issue://customer-portal/CP-42
```

### Agent leases

Kata ownership may already be sufficient, but extra lease semantics could be layered on later if needed.

### Cross-project knowledge

Allow explicit references without mixing project-specific context by default.

---

## 19. Definition of Done

The project is complete when:

- [ ] No workflow setup file is required inside a source repo.
- [ ] No `.kata.toml` is required inside a source repo.
- [ ] Project identity resolves externally.
- [ ] Multiple worktrees resolve to the same logical project.
- [ ] Kata works from all registered checkouts.
- [ ] Knowledge is shared across worktrees/clones.
- [ ] Project knowledge overrides global knowledge.
- [ ] `to-tickets` creates Kata issues.
- [ ] `triage` uses Kata labels/close reasons.
- [ ] `implement` claims and closes issues with evidence.
- [ ] Specs and PRDs are stored externally.
- [ ] ADRs and domain context are stored externally.
- [ ] Research is stored externally.
- [ ] Rejected ideas are stored externally.
- [ ] Unmodified workflow usage leaves `git status` unchanged.
- [ ] Core upstream skills remain mostly untouched.
- [ ] Upstream changes from Matt's repository can be merged with minimal conflict.

---

## 20. Recommended First Milestone

Build only these pieces first:

1. `agent project`
2. external `projects.yaml`
3. `agent issue ...` -> Kata
4. `agent kb ...` -> shared folder
5. repository cleanliness test

Then adapt one complete workflow:

```text
to-spec
   ->
to-tickets
   ->
triage
   ->
implement
```

Once that works end-to-end across two worktrees without creating any agent artifacts in the repository, expand the remaining skills.
