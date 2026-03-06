# Contributing to Parallax

Parallax is a strict plan-first TypeScript monorepo (`pnpm` workspaces).

## Project structure

- `packages/orchestrator`: polling, task state machine, API.
- `packages/ui`: dashboard and task observability.
- `packages/agent-adapters`: Gemini and Codex plan/execute adapters.
- `packages/common`: shared models and execution interfaces.
- `packages/cli`: control CLI (`parallax start|stop|provision|pending|logs`).

## Contribution expectations

- Keep behavior explicit and deterministic.
- Use existing strict parsing and error-first patterns over fallbacks.
- Add unit tests for behavior changes.
- Keep prompt surfaces bounded to their action (plan vs execution).
- Avoid hidden compatibility behavior. If required configuration is missing, fail fast with a clear error.

## Workflow

```bash
pnpm install
pnpm test
pnpm build
pnpm lint
```

### CLI test guidance

Any change to `pending` or config parsing should keep strict errors for malformed input and include/update coverage in `packages/cli/test`.

### Adapter test guidance

If you touch `PlanResultStatus`/plan parsing, keep tests for:
- valid plan payload
- clarification flow
- invalid status payload behavior
- execution command construction

### Submitting changes

- Fork or branch from `main`.
- Keep docs aligned with behavior updates in the same commit.
- Include tests for edge cases and fail-fast validation paths.
