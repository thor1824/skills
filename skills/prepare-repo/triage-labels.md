# Issue Statuses

The skills speak in terms of seven canonical implementation-issue states. This file maps those states to the actual front matter `status` strings used in this repo's markdown issue files.

| Canonical state | `status` value in our tracker | Meaning |
| --------------- | ------------------------------ | ------- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human action for implementation issues |
| `in-progress` | `in-progress` | Implementation is underway |
| `done` | `done` | Implementation is complete |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions an implementation-issue state, use the corresponding front matter `status` value from this table. Do not write canonical state names directly if this table maps them to different tracker values.

PRDs are different: a new PRD is created with only `type: PRD` in front matter. A PRD may later be closed with `status: done` or `status: wontfix`, but it does not use the normal issue triage states.

Edit the right-hand column to match whatever vocabulary you actually use.
