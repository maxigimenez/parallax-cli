# AGENTS.md

Repository-specific Codex guidance for `parallax-cli`.

## Available local skills

- `add-tests`: Add or update tests when a change affects behavior, parsing, prompts, workflows, or output formats. File: `.codex/skills/add-tests/SKILL.md`
- `update-docs`: Update docs when a change affects setup, commands, config, user-facing behavior, workflows, or expectations. File: `.codex/skills/update-docs/SKILL.md`

## Trigger rules

- Use `add-tests` for any non-trivial code change unless the change is purely editorial or test-only.
- Use `update-docs` for any change that may alter how a user installs, configures, runs, approves, reviews, or understands Parallax behavior.
- If a change does not require tests or docs, say so explicitly in the final summary.

## Repo expectations

- Keep tests close to the changed behavior and prefer updating existing suites before creating broad new scaffolding.
- Treat docs updates as part of the same change, not follow-up work.
- Do not mark docs as updated unless the relevant user-facing docs were actually checked.
