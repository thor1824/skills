# Parallelism Requirements

This document records what any future parallel subagent implementation must preserve or change. It is intentionally not a concrete v2 design.

## Purpose

`/issue-manager` v1 is intentionally sequential. Parallel execution is a future implementation that must be designed deliberately rather than added by incremental drift.

## Must-preserve invariants

Any future parallel implementation must preserve these invariants:

- each worker still gets its own isolated git branch and worktree
- the manager remains the only actor that claims issues and merges branches
- issue-state transitions remain committed and auditable
- worker failures never silently auto-resolve
- merge decisions remain serialized even if implementation becomes parallel
- worker report files remain deterministic and inspectable
- blockers are still resolved from the issue tracker, not guessed from chat context

## V1 assumptions that parallelism would have to relax or replace

Parallelism would require revisiting these current v1 assumptions:

- exactly one active managed branch/worktree pair exists at a time
- no nested runs are allowed
- no manifest file or persisted run ledger is needed
- `run` claims at most one issue per invocation
- the full run hard-stops on the first claimed-issue failure
- `complete` infers the active claim from unique managed artifacts
- `status` and `cleanup` only have to reason about one active worker lineage

## Future design requirements

Any future parallel implementation should define:

- claim/lock semantics for multiple simultaneously claimed issues
- how to detect or avoid overlapping subsystem work before spawning multiple workers
- how to serialize merges while workers run in parallel
- how to represent multiple active worker branches/worktrees without ambiguity
- whether a manifest or equivalent manager-owned state file becomes necessary
- how `status` and `cleanup` report multiple active workers and multiple failure states
- how recovery works when one worker succeeds and another fails
- how the JSON protocol changes when more than one worker can be active at once
- what additional worker-contract guarantees are required for safe parallel execution

## Out of scope for v1

These items are explicitly out of scope for the current implementation:

- concurrent claims
- multiple active worker worktrees
- multiple active worker branches
- automatic resume of leftover completed workers
- manifest-backed multi-worker recovery
- subsystem-based scheduling or conflict prediction
- any automatic branch reuse or stale-worktree reclamation
