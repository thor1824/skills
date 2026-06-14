# Issue Statuses

The skills speak in terms of eight canonical issue states. This file maps those states to the actual front matter `status` strings used in this repo's markdown issue files.

| Canonical state | `status` value in our tracker | Meaning                                  |
| --------------- | ------------------------------ | ---------------------------------------- |
| `needs-triage`  | `needs-triage`                 | Maintainer needs to evaluate this issue  |
| `needs-info`    | `needs-info`                   | Waiting on reporter for more information |
| `ready-for-slicing` | `ready-for-slicing`        | PRD approved for `/to-issues`            |
| `ready-for-agent` | `ready-for-agent`            | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`            | Requires human action for implementation issues |
| `in-progress`   | `in-progress`                  | Implementation is underway               |
| `done`          | `done`                         | Implementation is complete               |
| `wontfix`       | `wontfix`                      | Will not be actioned                     |

When a skill mentions a state, use the corresponding front matter `status` value from this table. Do not write canonical state names directly if this table maps them to different tracker values.

Edit the right-hand column to match whatever vocabulary you actually use.
