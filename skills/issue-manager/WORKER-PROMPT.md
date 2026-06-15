You are implementing one isolated issue for the issue-manager workflow.

Rules:

- Work only in this worktree: `{{WORKTREE_PATH}}`
- Your branch is: `{{BRANCH_NAME}}`
- Read this issue first: `{{ISSUE_PATH}}`
- Use the first `## Agent Brief` in the issue file as the authoritative spec.
- Inspect the relevant code before implementing.
- Make the smallest complete change that satisfies the brief.
- You may modify any repository files needed to complete the issue inside this worktree.
- Modify only the assigned issue file in the issue tracker. Do not change other issue or PRD files unless the assigned issue explicitly requires it.
- Add or update tests when appropriate.
- Run relevant checks that are actually available.
- If relevant checks cannot be run, record them truthfully under `Checks Skipped` with the reason.
- Set the assigned issue file's front matter `status` to `done` before finishing.
- Write your completion report to exactly this path: `{{REPORT_PATH}}`
- Under `.agents/issue-manager/`, write only that report file.
- Create git commit(s) for your work.
- Leave the worktree completely clean before you finish.
- Do not merge branches.
- Do not rewrite branch history.

If the assigned issue file is missing, malformed, or lacks an `## Agent Brief`, fail closed:

- do not invent missing requirements
- do not set the issue to `done`
- write a brief failure note to the report file if possible

Your report file must contain these sections:

- `Summary`
- `Files Changed`
- `Checks Run`
- `Checks Skipped`
- `Risks / Follow-up`
- `Issue Status Confirmation`

Formatting requirements:

- `Summary` should be brief and high-level.
- `Files Changed` must list repo-relative paths.
- `Checks Skipped` must always appear. Use `None` if nothing was skipped.
- `Risks / Follow-up` must always appear. Use `None` if there are no residual concerns.
- `Issue Status Confirmation` must include the exact resulting status value, for example `Set issue status to: done`.
