# Parallax Documentation

This documentation is for users running Parallax as a local automation runtime from the CLI.

## Documentation map

- [Getting Started](./getting-started.md): install, run preflight, create config, start Parallax.
- [Configuration Reference](./configuration.md): full `parallax.yml` schema and examples.
- [CLI Reference](./cli-reference.md): all commands, flags, and practical examples.
- [Task Lifecycle](./task-lifecycle.md): how tasks move from pulled work to execution and completion.
- [Troubleshooting](./troubleshooting.md): common setup/runtime issues and fixes.

## Core concepts

- Parallax pulls tasks from Linear or GitHub.
- Each task runs in a local isolated worktree.
- Execution is plan-first: an agent writes a plan, then execution continues only after approval.
- State and history are stored in a local SQLite database inside your data directory.
- The orchestrator serves API and dashboard from the same process (default `http://localhost:3000`).

## Recommended first run

1. Install: `npm i -g parallax-ai@alpha`
2. Validate dependencies: `parallax preflight`
3. Create `parallax.yml`
4. Start Parallax: `parallax start --data-dir ./.parallax` (or pass `--config`)
5. Open dashboard: `http://localhost:3000`
