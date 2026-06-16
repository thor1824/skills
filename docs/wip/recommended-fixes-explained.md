# Recommended Fixes Explained

## 1. Treat the first reviewer pass as a wider contract audit

The immediate lesson from this run is that the first reviewer pass usually reveals a category of weakness, not just isolated lines to patch. Here, the first findings were about undefined brief source, status format, and report lifecycle. Those are all contract-definition problems. Once that pattern was visible, it was predictable that adjacent gaps would exist too: path resolution, dirty-worktree behavior, extra input lines, and final caller response.

So the better approach is: after the first reviewer pass, do not only fix the literal findings. Also inspect neighboring assumptions in the same contract surface:

- input format
- path semantics
- preconditions
- failure behavior
- output/report behavior
- caller-facing completion signal

That would have reduced the number of review rounds because several later “new” findings were really part of the same underlying issue: the subagent contract was underspecified.

## 2. Keep a short unresolved checklist after cycle 1

In a loop like this, it is easy to become purely reactive: fix what the reviewer just said, rerun, repeat. The downside is that the work becomes narrow and incremental, and you risk rediscovering related issues one at a time.

A short checklist acts as a local control panel for the rest of the loop. After the first pass in this case, a useful checklist would have been:

- Where does each input come from?
- How are relative vs absolute paths resolved?
- What must be true before work starts?
- What happens on failure?
- What must be written to disk?
- What must be returned directly to the caller?
- What final git state is required?

That checklist is not a replacement for the reviewer. It is a way to make each patch batch more complete before rerunning the reviewer. The result is fewer cycles, less repeated file editing, and lower risk of missing a sibling ambiguity.

## 3. Explicitly mark work beyond the skill’s loop cap as a new manual follow-up phase

The `subagent-improver-leanest` skill says to run at most 3 review-fix cycles. In this run, that cap was reached, but then you asked to continue. Continuing was reasonable, but the process boundary became fuzzy: was I still executing the skill, or had I moved into ordinary manual improvement?

That matters because process clarity affects trust and auditability. If I say explicitly:

- “The formal 3-cycle skill loop is complete.”
- “The next edits are a manual follow-up based on remaining reviewer findings.”
- “I’ll run one final verification pass afterward.”

then the workflow stays legible. You can tell which part was governed by the skill and which part was an extra user-authorized extension. That is useful for repeatability, and it prevents accidental drift where a bounded loop silently turns into an open-ended one.

## 4. Check adjacent orchestrator files earlier

This run improved substantially once I looked at `skills/issue-manager/SKILL.md`, `skills/PROCESS.md`, `skills/triage/SKILL.md`, and `skills/issue-manager/manager.mjs`. Those files contained the actual repo conventions that the subagent should follow:

- last `## Agent Brief` wins
- `status` lives in YAML front matter
- `.agents/issue-manager/` is runtime output
- the worker prompt has four specific labeled lines

Those facts should ideally have been pulled in earlier, right after the first review pass. The reason is that subagent files often sit at the edge of a larger orchestration system. If the subagent contract is ambiguous, the best source is usually not the reviewer alone and not the subagent file alone, but the orchestrator that calls it and the docs that define the workflow.

In practice, this means: when a reviewer flags operational ambiguity in an agent file, immediately inspect:

- the parent workflow skill
- the manager/orchestrator entrypoint
- any shared process docs
- any tracker/domain contract docs

That gives you the authoritative local model faster and reduces speculative edits.
