---
type: PRD
status: needs-triage
category: enhancement
blocked_by: []
---

## Problem Statement

The repo currently contains only a starter frontend template and does not model the Team Lunch Picker domain at all. The user wants a small but realistic internal web application where a team can run a daily lunch poll, rank up to three restaurants, apply weighted voting, and see the final winner or winners for the day. The implementation should stay intentionally small, easy to understand, easy to extend, and easy to test.

## Solution

Build Team Lunch Picker as a compact React and TypeScript application with clear separation between domain logic, application workflows, storage, and UI. The app will support one **Lunch poll** per day, a reusable **Restaurant** catalog, explicit acting **Team member** selection without authentication, weighted ranked voting, live aggregate standings while a poll is open, and final results for closed polls. Persistence will use simple JSON file storage behind small repository interfaces so the app remains understandable while still surviving restarts.

## User Stories

1. As a **Team member**, I want to select myself in the app, so that the system knows which vote belongs to me without adding authentication.
2. As a **Team member**, I want to see the current day's **Lunch poll**, so that I know whether voting is open and which **Restaurants** are available.
3. As a **Team member**, I want to rank one **Restaurant**, so that I can still participate even if I only have one clear preference.
4. As a **Team member**, I want to rank two **Restaurants**, so that I can express a fallback option without needing a full top three.
5. As a **Team member**, I want to rank three **Restaurants**, so that I can express my full preference order.
6. As a **Team member**, I want my ranking order to affect scoring, so that my first choice counts more than my later choices.
7. As a **Team member**, I want the app to reject duplicate **Restaurants** in my **Vote**, so that each ranking position remains meaningful.
8. As a **Team member**, I want the app to reject a fourth ranked choice, so that voting stays within the defined weighted rules.
9. As a **Team member**, I want to submit only one **Vote** per **Lunch poll**, so that the poll stays fair.
10. As a **Team member**, I want to reopen my existing **Vote** while the **Lunch poll** is open, so that I can see what I already submitted.
11. As a **Team member**, I want to edit my **Vote** while the **Lunch poll** is open, so that I can change my mind before voting ends.
12. As a **Team member**, I want a vote edit to replace my earlier ranking, so that only my current preference affects the result.
13. As a **Team member**, I want to be prevented from voting after a **Lunch poll** is closed, so that final results remain stable.
14. As a **Team member**, I want to be prevented from editing my **Vote** after a **Lunch poll** is closed, so that the closed result is final.
15. As a **Team member**, I want to see live aggregate standings while the **Lunch poll** is open, so that I can follow the current score without seeing who voted for what.
16. As a **Team member**, I want open-poll standings to hide per-member vote details, so that the app avoids exposing each person's exact ranking.
17. As a **Team member**, I want a closed **Lunch poll** to show final totals, so that I can understand how the result was determined.
18. As a **Team member**, I want a closed **Lunch poll** to show the derived **Winner**, so that the team can quickly see where lunch was decided.
19. As a **Team member**, I want tied top-scoring **Restaurants** to appear as joint **Winners**, so that ties are represented honestly instead of broken arbitrarily.
20. As a **Team member**, I want to browse a simple history of closed **Lunch polls**, so that I can see previous lunch decisions.
21. As a poll organizer, I want to create the day's **Lunch poll** from the reusable **Restaurant** catalog, so that the team has a fixed set of options before voting starts.
22. As a poll organizer, I want there to be at most one **Lunch poll** for a given day, so that "today's poll" remains unambiguous.
23. As a poll organizer, I want to close a **Lunch poll** explicitly, so that voting ends when the team is ready rather than on a clock rule.
24. As a poll organizer, I want a closed **Lunch poll** to stay closed, so that the result becomes a stable historical record.
25. As a developer, I want the weighted scoring rules to live in a small, isolated domain module, so that the core business rules are easy to test directly.
26. As a developer, I want storage concerns behind repository interfaces, so that the app can use JSON now and switch later without rewriting domain behavior.
27. As a developer, I want seeded **Team members** and **Restaurants**, so that the sample app is usable immediately without extra setup workflows.
28. As a developer, I want the app to remain intentionally small, so that it stays suitable as a teaching and extension-friendly sample codebase.

## Implementation Decisions

- The application will use the domain vocabulary established in `CONTEXT.md`, especially **Team member**, **Restaurant**, **Lunch poll**, **Vote**, **Vote edit**, and **Winner**.
- **Winner** is a derived result of a closed **Lunch poll**, not a separately managed entity.
- A **Restaurant** is reusable across many **Lunch polls** and has stable identity even in the initial small implementation.
- A **Lunch poll** has a fixed list of **Restaurants** chosen before voting opens.
- Team-driven restaurant proposal workflow is out of scope for the initial implementation even though the broader product idea mentions proposing places.
- A **Vote** is modeled conceptually as an ordered ranking of one to three distinct **Restaurants**, not as three unrelated fields.
- Weighted scoring is fixed to 3 points for first place, 2 for second, and 1 for third.
- Vote validation must reject duplicate ranked **Restaurants** and rankings longer than three choices.
- A **Team member** may have at most one **Vote** per **Lunch poll**.
- A **Vote edit** replaces the entire existing ranking rather than patching individual positions.
- A **Lunch poll** starts open and remains open until an explicit close action is performed in the app.
- A closed **Lunch poll** is final and cannot be reopened.
- There is at most one **Lunch poll** for a given day.
- The acting **Team member** is chosen explicitly in the app from a seeded list rather than authenticated through an external identity system.
- Open **Lunch polls** may show live aggregate standings by **Restaurant**, but they must not expose per-member vote details.
- The first version will use a fixed reusable **Restaurant** catalog with no in-app restaurant CRUD.
- Poll creation and closure are available app actions without separate role concepts in the initial version.
- The UI should show the current **Lunch poll** and a simple history of closed **Lunch polls**.
- The codebase should be structured into small modules with a strong deep-module center around domain behavior and workflow orchestration.
- The domain module should encapsulate scoring, winner derivation, poll openness checks, vote replacement semantics, and invariant enforcement behind a stable API.
- The application module should orchestrate workflows such as create poll, list current and historical polls, submit vote, edit vote, and close poll.
- The storage module should provide JSON-backed repositories for **Team members**, **Restaurants**, **Lunch polls**, and **Votes**, while keeping file format details out of domain logic.
- The UI should be a simple React front end that makes the domain rules visible through straightforward interactions rather than hidden magic.
- Seed data should make the app runnable immediately with a small set of **Team members** and **Restaurants**.

## Testing Decisions

- Good tests should verify externally observable behavior and domain outcomes rather than internal implementation details or component structure.
- The strongest test emphasis should be on the domain module because it contains the weighted voting rules, uniqueness constraints, winner derivation, tie handling, and poll lifecycle behavior.
- Application workflow tests should verify boundary behavior for create poll, submit vote, edit vote, close poll, and list results using repository doubles or lightweight test repositories.
- Storage tests should be lighter and should focus on persistence behavior that matters externally, such as reading seeded data and preserving polls and votes across reloads.
- UI tests are optional and should stay minimal if added; the main value of this sample app is in domain and application behavior rather than dense component test coverage.
- Prior art in the current repo is limited because the codebase is still a starter template, so tests should establish the project style rather than imitate an existing suite.
- Tests should prefer small, explicit scenarios with named **Team members**, **Restaurants**, and **Lunch polls** so the scoring and lifecycle rules are obvious from the setup.

## Out of Scope

- Authentication and authorization
- Separate admin and voter role models
- Team-driven restaurant proposal workflow
- In-app restaurant management
- Complex permissions
- Automatic poll closure by time, date, or scheduler
- Reopening closed polls
- External APIs, notifications, payments, or integrations
- Production deployment architecture
- Rich analytics, audit logs, or reporting beyond simple standings and poll history
- Arbitrary tie-breaker rules beyond showing all joint **Winners**

## Further Notes

- The current repo is a Vite React TypeScript starter, so the implementation will replace template content with the Team Lunch Picker application.
- The repo shape suggested in the original request remains a good target, with clear separation between app orchestration, domain rules, storage, UI, tests, and docs.
- JSON file persistence is a deliberate compromise: realistic enough to survive restart, but simpler and easier to inspect than a database-backed setup.
- No ADR is needed at this stage because the chosen implementation approach is intentionally lightweight, easy to reverse, and not surprising once documented in the PRD and glossary.
