# Contributing to Parallax

Parallax is a strict plan-first TypeScript monorepo (`pnpm` workspaces).

## Local prerequisites

- Node.js `>= 23.7.0`
- `pnpm`
- `git`
- `gh`
- at least one supported agent CLI (`codex`, `gemini`, or `claude`)

## Project structure

- `packages/orchestrator`: polling, task state machine, API.
- `packages/ui`: dashboard and task observability.
- `packages/common`: shared models and execution interfaces.
- `packages/cli`: control CLI (`parallax start|stop|register|pending|logs`).

## Contribution expectations

- Keep behavior explicit and deterministic.
- Use existing strict parsing and error-first patterns over fallbacks.
- Add unit tests for behavior changes.
- Keep prompt surfaces bounded to their action (plan vs execution).
- Avoid hidden compatibility behavior. If required configuration is missing, fail fast with a clear error.
- Use `pnpm parallax <command>` for local manual testing so development matches the published npm package entrypoint.

## Workflow

```bash
pnpm install
pnpm parallax preflight
pnpm test
pnpm build
pnpm lint
```

`pnpm parallax preflight` should pass before runtime changes are tested manually.

### Local runtime

Use the CLI entrypoint for all local runtime checks:

```bash
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.yml --env-file ./.env
pnpm parallax pending
pnpm parallax logs
pnpm parallax stop
```

Do not start the orchestrator or UI directly from package-level scripts for normal development flows.

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
