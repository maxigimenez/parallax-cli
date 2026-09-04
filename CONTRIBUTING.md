# Contributing to Sentinel0

Sentinel0 is a strict plan-first TypeScript monorepo (`pnpm` workspaces).

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
- `packages/cli`: control CLI (`sentinel0 init|start|stop|agents|routes|runs|logs`).

## Contribution expectations

- Keep behavior explicit and deterministic.
- Use existing strict parsing and error-first patterns over fallbacks.
- Add unit tests for behavior changes.
- Keep prompt surfaces bounded to their action (plan vs execution).
- Avoid hidden compatibility behavior. If required configuration is missing, fail fast with a clear error.
- Use `pnpm sentinel0 <command>` for local manual testing so development matches the published npm package entrypoint.

## Workflow

```bash
pnpm install
pnpm sentinel0 preflight
pnpm test
pnpm build
pnpm lint
```

`pnpm sentinel0 preflight` should pass before runtime changes are tested manually.

### Local runtime

Use the CLI entrypoint for all local runtime checks:

```bash
pnpm sentinel0 start --api-port 9371 --concurrency 2
pnpm sentinel0 agents
pnpm sentinel0 runs
pnpm sentinel0 logs --follow
pnpm sentinel0 stop
```

Do not start the orchestrator or UI directly from package-level scripts for normal development flows.

### CLI test guidance

Any change to argument or config parsing should keep strict errors for malformed input and include/update coverage in `packages/cli/test`.

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
