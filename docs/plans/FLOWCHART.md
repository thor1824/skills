# Engineering skills flowchart

original: https://github.com/mattpocock/skills

Use this as the quick routing map for the engineering skills. The detailed
rules remain in each skill's `SKILL.md`; this page shows how the skills hand
work to one another.

## End-to-end flow

```mermaid
flowchart TD
    Setup["First run in a repo:<br/>/setup-matt-pocock-skills"] --> Start{What kind of work is this?}

    Start -->|A workable idea| Grill["/grill-with-docs<br/>Sharpen the idea and update<br/>CONTEXT.md + ADRs"]
    Start -->|A huge, foggy effort| Wayfinder["/wayfinder<br/>Map and resolve decision tickets"]
    Start -->|Incoming bugs or requests| Triage["/triage<br/>Classify, verify, and make agent-ready"]
    Start -->|Something is broken| Diagnose["/diagnosing-bugs<br/>Create a tight red feedback loop"]
    Start -->|Codebase health work| Improve["/improve-codebase-architecture<br/>Find deepening opportunities"]

    Wayfinder -->|Route is clear| Spec
    Triage -->|ready-for-agent| Implement
    Diagnose --> Fix["Reproduce + minimise → hypothesise →<br/>instrument → fix + regression test"]
    Fix --> BugCleanup["Re-run the original repro,<br/>remove instrumentation, record the cause"]
    BugCleanup --> BugDone["Bug resolved"]
    Diagnose -.->|Post-mortem finds no good seam| Improve
    Improve -->|Choose an opportunity| Grill

    Grill --> Runnable{Does a question need<br/>a runnable answer?}
    Runnable -->|Yes| HandoffOut["/handoff to a fresh<br/>prototype session"]
    HandoffOut --> Prototype["/prototype<br/>Answer one design question<br/>with throwaway code"]
    Prototype --> HandoffBack["/handoff the learning back"]
    HandoffBack --> Size
    Runnable -->|No| Size{Will the build take<br/>multiple sessions?}

    Size -->|Yes| Spec["/to-spec<br/>Collapse decisions into a buildable spec"]
    Spec --> Tickets["/to-tickets<br/>Create vertical tracer-bullet tickets<br/>with blocking edges"]
    Tickets --> Frontier{"Any unblocked ticket<br/>on the frontier?"}
    Frontier -->|Yes| Clear["/clear<br/>Start a fresh context for the ticket"]
    Frontier -->|No, blockers remain| Wait["Wait for a blocker to finish"]
    Wait --> Frontier
    Clear --> Implement["/implement"]
    Implement --> TDD["/tdd<br/>Red → Green → Refactor<br/>one vertical slice at a time"]
    TDD --> Checks["Typecheck regularly;<br/>focused tests regularly;<br/>full suite at the end"]
    Checks --> Review["/code-review<br/>Standards axis + Spec axis"]
    Review --> Ready{Review findings<br/>resolved?}
    Ready -->|No| TDD
    Ready -->|Yes| Commit["Commit the work"]
    Commit --> More{More tickets?}
    More -->|Yes| Frontier
    More -->|No| Shipped["Shipped"]

    Size -->|No| Implement
```

Key constraints:

- Keep grilling, prototyping, specification, and ticket breakdown in one
  unbroken context where possible. Clear only after `/to-tickets`; each ticket
  is then implemented in a fresh context.
- `/wayfinder` produces decisions, not the build. Its normal handoff is
  `/to-spec`, not `/implement`.
- `/triage` is for incoming work. Tickets created by `/to-tickets` are already
  agent-ready and must not be triaged again.
- `/prototype` answers a design question. Its learning feeds the real work; the
  prototype is not production code.
- `/domain-modeling` supplies domain language beneath the flow.
  `/codebase-design` supplies the module, interface, seam, and depth vocabulary
  used by design, TDD, and architecture improvement.

## Phase-boundary decision

Use this tree only between phases. The first **yes** wins.

```mermaid
flowchart TD
    Boundary["A phase has ended"] --> ContinueQ{"Can the next phase stay here?<br/>It needs this primary source,<br/>or enough smart-zone context remains"}
    ContinueQ -->|Yes| Continue["Continue in this session"]
    ContinueQ -->|No| Irrelevant{"Is the current context<br/>irrelevant to what comes next?"}
    Irrelevant -->|Yes| Clear["/clear"]
    Irrelevant -->|No| Travel{"Must the work move to a new harness,<br/>directory, colleague, or mid-phase side task?"}
    Travel -->|Yes| Handoff["/handoff<br/>Write a portable Markdown file"]
    Travel -->|No| AFK{"Can a tightly scoped task<br/>run without human steering?"}
    AFK -->|Yes| Subagent["Use a subagent<br/>and keep this session intact"]
    AFK -->|No| Compact["/compact<br/>Preserve a lossy summary<br/>for the next phase"]
```

Mid-phase, keep working in the current session or split a tightly scoped side
task into a subagent. Do not compact merely to tidy the context.

## Standalone and supporting tools

These skills do not form additional required stages in the main pipeline:

| Situation | Skill | How it rejoins the work |
| --- | --- | --- |
| No working directory; the idea still needs sharpening | `/grill-me` | Produces understanding, but no repo documentation |
| A factual gap needs primary-source investigation | `/research` | Feed the cited findings into `/grill-with-docs` |
| Required knowledge lives with another person | `/to-questionnaire` | Feed their answers into `/grill-with-docs` or `/to-spec` |
| Only a human can complete setup or dashboard steps | `/wizard` | The generated script guides the human, then implementation resumes |
| A merge or rebase already has conflicts | `/resolving-merge-conflicts` | Resolve each hunk by intent and finish the Git operation |
| A concrete behaviour is already clear | `/tdd` | Run the red-green-refactor loop directly |
| A branch or PR only needs review | `/code-review` | Review from a fixed point on Standards and Spec axes |
