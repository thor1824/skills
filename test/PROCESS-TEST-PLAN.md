# Skill Chain Test Plan

## Scope

The system under test is the end-to-end skill chain described in [PROCESS.md](../skills/PROCESS.md): `/prepare-repo` -> optional `/grill-with-docs` -> `/to-prd` -> `/to-issues` -> `/triage` -> implementation handoff.

The key behavior is not "did a skill run", but "did each producer emit the exact artifacts and fields the next consumer needs" per the handoff rules in [PROCESS.md](../skills/PROCESS.md).

This plan combines:

- Contract tests for each skill's output artifact
- Handoff tests between adjacent skills
- End-to-end golden-path and failure-path scenarios

## Test Strategy

Use black-box fixtures: start from temporary repos with only markdown inputs and inspect observable outputs in `AGENTS.md`, `docs/agents/`, `.scratch/`, `.out-of-scope/`, and issue/PRD markdown front matter.

Avoid asserting internal prompts or implementation details.

Recommended fixture repos:

- `blank-repo`: no `docs/agents/`, no `.scratch/`
- `prepared-repo`: already bootstrapped by `/prepare-repo`
- `repo-with-domain-docs`: includes `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs
- `repo-with-existing-prd`: has a valid PRD in `.scratch/<slug>/PRD.md`
- `repo-with-existing-issues`: has issues in multiple statuses and categories

## Core Risks To Cover

- Missing handoff fields: `type`, mapped `status`, `category`, `blocked_by`
- Wrong status semantics between PRDs and Issues
- `/triage` accepting invalid state transition
- `/to-issues` slicing an unapproved PRD
- `/grill-with-docs` discoveries not surviving into durable artifacts
- `ready-for-agent` issued without a valid latest `## Agent Brief`
- `wontfix` enhancement path not writing `.out-of-scope/`

## Test Case Matrix

| Behavior | Input | Boundary | Expected Outcome | Collaborator Effects | Notes |
| --- | --- | --- | --- | --- | --- |
| prepare repo bootstrap | blank repo | missing all contracts | writes/updates `AGENTS.md` and `docs/agents` contract files | filesystem writes only | proves chain can start |
| prepare repo idempotence | prepared repo | rerun on existing setup | preserves valid existing contracts, no duplicate sections | filesystem writes only | important for repeated use |
| prd generation | prepared repo + feature request | minimal valid context | creates `.scratch/<slug>/PRD.md` with `type: PRD`, `category: enhancement`, `blocked_by: []`, mapped `needs-triage` status | `.scratch` write | direct handoff to triage |
| prd generation missing prep | blank repo + feature request | contracts absent | either blocks with explicit need for `/prepare-repo` or produces a clearly actionable failure | no partial invalid PRD | must not invent contracts |
| issue slicing approved prd | `ready-for-human` PRD | approved boundary | creates issue files with `type: Issue`, `category`, `blocked_by`, mapped `needs-triage` status | `.scratch` writes | direct handoff to triage |
| issue slicing unapproved prd | `needs-triage` PRD | not approved boundary | warns that triage approval is required, does not silently publish slices | no invalid issue creation | critical governance check |
| triage PRD happy path | PRD in `needs-triage` | `type: PRD` | transitions only to `needs-info`, `ready-for-human`, or `wontfix` | note write | PRD must never go to `ready-for-agent` |
| triage issue happy path | Issue in `needs-triage` | `type: Issue` | transitions to valid delivery states only | note write, agent brief write if needed | normal delivery flow |
| triage invalid type/state combo | PRD requested to `ready-for-agent` | semantic mismatch | flags mismatch and asks/blocks instead of applying invalid state | no invalid front matter | explicit rule in triage skill |
| ready-for-agent contract | Issue moved to `ready-for-agent` | latest brief absent boundary | writes/updates latest `## Agent Brief` with acceptance criteria before leaving state | issue note write | must preserve AFK contract |
| ready-for-human semantics | PRD vs Issue | same status name, different meaning | PRD note says approved for `/to-issues`; Issue note explains why human-only | note write | guards semantic drift |
| wontfix enhancement path | enhancement issue/PRD rejected | rejection boundary | sets status `wontfix` and writes `.out-of-scope` record | `.out-of-scope` write | must exist for memory |
| blocked dependencies | issue with blockers | `blocked_by` non-empty | preserves blocker list through triage and handoff | markdown update | no dropping dependencies |
| grill durable output | fuzzy terminology/decision | ambiguity boundary | established facts survive into `CONTEXT.md`, ADRs, PRD text, issue notes, or agent brief | docs writes | tests nothing gets lost |
| end-to-end golden path | feature request in blank repo | full chain | `/prepare-repo` -> PRD -> triage `ready-for-human` -> issues -> triage `ready-for-agent`/human with correct artifacts | all expected writes | main regression test |
| end-to-end rejection path | weak enhancement request | full chain negative | PRD/issue reaches `wontfix` with rationale and out-of-scope memory | `.out-of-scope` write | main negative regression test |

## End-to-End Scenarios

### 1. New feature, clean repo

Run `/prepare-repo`, `/to-prd`, `/triage`, `/to-issues`, `/triage`.

Assert all created files exist and every handoff field matches the process contract.

### 2. Fuzzy request requiring clarification

Run `/grill-with-docs` before `/to-prd`.

Assert clarified terminology appears later in PRD and/or triage artifacts, not only in transient chat.

### 3. PRD blocked from slicing

Feed `/to-issues` a PRD still in `needs-triage`.

Assert no issue files are produced and the response points back to `/triage`.

### 4. Issue delegated to agent

Move an Issue to `ready-for-agent`.

Assert front matter status is correct and the latest `## Agent Brief` includes current behavior, desired behavior, interfaces, acceptance criteria, and out-of-scope notes.

### 5. Rejected enhancement

Triage an enhancement to `wontfix`.

Assert status changes and `.out-of-scope/` receives a record.

## Acceptance Criteria For The Test Plan

- Every skill output is verified only through filesystem artifacts and markdown content
- Every adjacent handoff in [PROCESS.md](../skills/PROCESS.md) has at least one positive and one negative test
- Status semantics are tested separately for `type: PRD` and `type: Issue`
- At least 2 full-chain tests exist: one golden path, one rejection/failure path
- No test depends on internal prompt wording
