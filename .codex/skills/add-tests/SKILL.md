---
name: add-tests
description: Add or update automated tests for parallax-cli changes that affect behavior, parsing, prompts, workflows, adapters, or user-visible output. Use when implementing or reviewing non-trivial code changes in this repo.
---

# Add Tests

Use this skill whenever a change affects runtime behavior, parsing, prompt construction, API responses, CLI output, task lifecycle behavior, or PR/review flows.

## Workflow

1. Identify the narrowest existing test file that already covers the changed subsystem.
2. Extend existing tests before creating a new file unless the area has no coverage yet.
3. Cover the intended success path and the most likely regression or fail-fast path.
4. Keep assertions behavior-focused; avoid overspecifying incidental implementation details.
5. Run the smallest relevant test command first, then broaden only if needed.

## Repo guidance

- CLI parsing and command behavior usually belong in `packages/cli/test`.
- Orchestrator runtime, adapters, and git flows usually belong in `packages/orchestrator/test`.
- For prompt changes, assert on the generated prompt content or parsed metadata, not just that a command ran.
- For output formatting changes, preserve readable text and verify formatting only where it matters.

## When tests may be skipped

Tests can be skipped only for purely editorial/doc-only changes or repo metadata changes with no runtime effect. If skipped, say why in the final summary.

