---
type: Issue
status: ready-for-agent
category: enhancement
blocked_by:
  - .scratch/feature-b/issues/01-base-change.md
---

## Agent Brief

**Issue category:** enhancement
**Summary:** Make the follow-up fixture change

**Current behavior:**
The follow-up issue is blocked until the base change is done.

**Desired behavior:**
Once the blocker is done, the issue should become eligible for the worker loop.

**Acceptance criteria:**
- [ ] The issue remains blocked until `01-base-change.md` is done
- [ ] The issue becomes claimable after the blocker is merged

**Out of scope:**
- Additional issue-manager behavior beyond the unblock transition
