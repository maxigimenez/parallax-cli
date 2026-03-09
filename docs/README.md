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
- State and history are stored in a local SQLite database under `~/.parallax`.
- The API runs on `http://localhost:3000` by default and the dashboard runs on `http://localhost:8080` by default. Both ports are configurable with `parallax start` flags.

## Recommended first run

1. Install: `npm i -g parallax-ai@alpha`
2. Validate dependencies: `parallax preflight`
3. Create `parallax.yml`
4. Start Parallax: `parallax start`
5. Register config: `parallax register ./parallax.yml`
6. Open dashboard: `http://localhost:8080`
