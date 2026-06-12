---
name: black-box-test
description: Language-agnostic guidance for designing and writing automated black-box tests. Use when testing observable behavior through public interfaces without implementation details.
---

# Black-Box Test

## Test Flow

1. Identify the system under test and affected behavior.
2. Define test scope, risks, collaborators, inputs, boundaries, side effects, and sources of non-determinism.
3. For non-trivial SUTs, create a brief test case matrix.
4. Group test cases by identical act step, expected result, and test procedure.
5. Implement the smallest set of tests that covers the relevant behavior and risks.
6. Run test command(s) for all changed and affected code.
7. Fix meaningful gaps or list deferred cases explicitly.


### Glossary

- Test Case: one named scenario with specific setup, action, and expected observable outcome.
- System Under Test (SUT): the function, class, module, endpoint, component, or behavior being tested.
- Boundary: an edge around allowed, disallowed, minimum, maximum, empty, null, missing, or malformed input.
- Equivalence partition: a group of inputs expected to behave the same, where one representative case is usually enough.
- Side effect: an observable change outside the return value, such as writing data, sending a request, logging, emitting an event, or calling another component.
- Fixture: reusable setup data or objects needed by tests.
- Collaborator: another component the SUT calls or depends on, such as a database, API client, service, clock, filesystem, or helper.
- Mock/stub/fake: controlled replacements for real collaborators. Use the repository’s terminology and tools.
- AAA (Arrange-Act-Assert) pattern:
   - Arrange: Set up inputs and dependencies.
   - Act: Execute the SUT.
   - Assert: Verify observable behavior.


### Non-trivial System Under Test

Treat a SUT as non-trivial when any of these apply:
- More than one meaningful branch or outcome exists.
- Boundary, validation, error-handling, mapping, parsing, serialization, or contract behavior matters.
- Collaborator interactions or observable side effects matter.
- Multiple input partitions must be covered.
- Behavior is high-risk, business-critical, or bug-prone.

For non-trivial SUTs produce a test case matrix with the following format:
```
behavior | input | boundary | expected outcome | collaborator effects | notes
```


## Test Design

### Repository Conventions Rules

- You must infer the test stack from existing tests, project metadata, task runners, CI config, documentation, etc., if it is not already known.
- You must not introduce a new framework, dependency, directory structure, or naming convention unless the user explicitly instructs you to do so.
- You must reuse existing assertion libraries, mocking tools, fixtures, factories, naming style, file placement, etc.
- You must match existing project language conventions, framework usage, naming patterns, layouts, test levels, etc.
- You must use test commands that already exist or are known to be used in the project.
- You must use AAA pattern implicitly unless the codebase uses another clear equivalent.
- You must only use the variable name SUT if the codebase already uses that convention.


### Test Case Completeness

- Cover success behavior.
- Cover guard, invalid, and failure behavior.
- Split inputs into meaningful equivalence partitions.
- Check boundaries: below, at, and above important limits.
- Verify observable side effects and collaborator interactions when they are part of behavior.
- Add dedicated cases for mapping, transformation, serialization, parsing, and contract edges when relevant.
- Prefer representative cases over exhaustive, repeating, or overlapping combinations.


### Parameterization Rules

- Parameterize when cases share same act step, same expected result, and same test procedure.
- Split tests when outcome type, side effect type, or assertion logic differs materially.
- Add rows to an existing parameterized test before adding a new method when intent stays same.
- Keep case labels explicit so one failing row is diagnosable.
- Do not hide different assertions behind conditionals inside one test.


### Implementation Rules

- Prioritize extending existing test suites over creating new ones.
- Keep fixtures local unless shared reuse is clear.
- Prefer fakes or stubs over real I/O, unless real integration is required by the current scope of the test.
- Avoid sleeps, shared mutable state, hidden ordering assumptions, and random test data that is not seeded, constrained, or clearly relevant to the behavior under test.


## Stop Condition
- If code changes or execution are not possible: provide the test plan, test case matrix when useful, suggested file placement, expected assertions, and the exact information needed to implement or run the tests later.
- Do not stop at a plan if the user asked for code changes and the relevant files are available.
- tests are implemented, touched-scope tests pass, and deferred coverage is called out clearly.
