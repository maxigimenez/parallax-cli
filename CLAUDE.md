# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # install all workspace dependencies
pnpm build            # build all packages (tsc)
pnpm test             # run all tests
pnpm lint             # lint all packages
pnpm lint:fix         # auto-fix lint issues
pnpm clean            # remove local DB and worktrees artifacts

# run a single package's tests
pnpm --filter @parallax/orchestrator test
pnpm --filter parallax-cli test

# local development — use this entrypoint for all manual testing
pnpm parallax preflight
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.example.yml --env-file ./.env
pnpm parallax pending
pnpm parallax stop
```

Node.js >= 23.7.0 and pnpm 10.x are required. The `--filter` flag targets individual workspace packages by their `name` in `package.json`.

## Architecture

Parallax is a plan-first AI orchestration runtime. It pulls work from Linear or GitHub, generates a plan via an AI agent, waits for human approval, then executes the approved plan in an isolated git worktree and opens a PR.

### Package layout

- **`packages/common`** — shared models, enums (`TASK_STATUS`, `TaskPlanState`, `AGENT_PROVIDER`, etc.), interfaces (`Task`, `ProjectConfig`, `AgentResult`, `PlanResult`), and the `HostExecutor` abstraction. All cross-package types live here.
- **`packages/orchestrator`** — the runtime process: polling loop, task state machine, AI adapter dispatch, Fastify REST API, Socket.io streaming, SQLite persistence.
- **`packages/cli`** — the published `parallax-cli` npm package. It is the sole entry point for users. Commands talk to the orchestrator over HTTP. The `start` command forks the orchestrator as a child process and writes `~/.parallax/running.json`.
- **`packages/ui`** — React/Vite dashboard served by the orchestrator's UI server in production.
- **`packages/marketing`** — standalone marketing site, not part of the runtime.

### Runtime state (`~/.parallax/`)

| File/Dir | Purpose |
|---|---|
| `registry.json` | Registered `parallax.yml` configs and optional env file paths |
| `running.json` | PID, ports, concurrency of the active orchestrator process |
| `parallax.db` | SQLite — tasks and task logs tables |
| `worktrees/` | Ephemeral git worktrees created per task, cleaned up after execution |

Override via `PARALLAX_DATA_DIR` env var.

### Task state machine

Tasks move through two parallel dimensions:

**`TASK_STATUS`**: `PENDING` → `IN_PROGRESS` → `COMPLETED` / `FAILED` / `CANCELED`

**`TaskPlanState`**: `PLAN_GENERATING` → `PLAN_READY` / `PLAN_REQUIRES_CLARIFICATION` → _(user approves)_ → `PLAN_APPROVED` → execution → `PLAN_APPROVED` (persisted on PR creation). `NOT_REQUIRED` is used for PR-review tasks that skip planning.

State transitions are coordinated through `taskLifecycle` (`packages/orchestrator/src/task-lifecycle.ts`) which writes to the DB and updates the in-memory log display.

### Orchestrator polling loop (`packages/orchestrator/src/index.ts`)

The `main()` function runs an infinite loop (15 s interval) calling `pollProjects()`. For each registered project it:
1. Fetches new issues from the configured provider (Linear or GitHub).
2. Creates worktrees and runs `adapter.runPlan()` for tasks needing a plan.
3. Dispatches `adapter.runTask()` for tasks with an approved plan.
4. Enforces a `pLimit` concurrency cap across all projects.

Cancellation is tracked via an in-memory `canceledTasks: Set<string>` checked at each `throwIfCancellationRequested()` call.

### AI adapters (`packages/orchestrator/src/ai-adapters/`)

`BaseAgentAdapter` defines two abstract methods: `runPlan(task, workingDir, project)` and `runTask(task, workingDir, project, approvedPlan?, outputMode?)`. Concrete implementations: `CodexAdapter`, `GeminiAdapter`, `ClaudeCodeAdapter`. The adapter is selected from `project.agent.provider` in `parallax.yml` and cached per project in an `adapterCache` map.

### Configuration flow

`parallax register ./parallax.yml` writes the config path to `~/.parallax/registry.json`. At runtime, `loadConfig()` reads and merges all registered YAML files. Required fields per project entry: `id`, `workspaceDir`, `pullFrom.provider`, `pullFrom.filters`, `agent.provider`.

## Key conventions

- **Fail fast**: missing required config or malformed input throws immediately — no silent fallbacks.
- **Strict parsing**: all CLI arg and request parsing goes through dedicated parser functions in `args.ts` and `runtime/api/request-parsers.ts`; never parse inline.
- **`pnpm parallax <command>`** is the canonical local testing entrypoint — do not invoke package-level scripts directly for runtime flows.
- **Docs updates belong in the same commit** as behavior changes.
- Tests live in `packages/<name>/test/` and mirror the `src/` structure.
