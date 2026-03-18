---
name: update-docs
description: Review and update parallax-cli documentation when a change affects commands, setup, configuration, workflows, approvals, PR behavior, or other user-facing expectations. Use alongside implementation work in this repo.
---

# Update Docs

Use this skill whenever a change could alter what a user sees, runs, configures, or expects.

## Workflow

1. Check the nearest docs first:
   - `README.md` for top-level product behavior and quickstart
   - `docs/` for command and workflow details
   - package README files for package-specific usage
2. Update only the docs impacted by the change.
3. Keep wording concrete and aligned with the actual behavior in code.
4. If no docs change is needed, confirm that you checked and mention that in the final summary.

## Common triggers

- CLI flags, defaults, output, or command semantics changed
- Setup or prerequisite expectations changed
- Approval, planning, retry, PR, or review flows changed
- Configuration schema or examples changed

## Avoid

- Broad doc rewrites unrelated to the task
- Leaving docs for a follow-up when the behavior change is already merged

