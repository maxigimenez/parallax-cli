# CLI Reference

## Global usage

```bash
parallax --version
parallax --help
```

## `parallax preflight`

Validate local prerequisites before first run.

```bash
parallax preflight
```

Notes:

- no flags accepted
- returns non-zero exit code when required checks fail
- prints a final verdict (`PASS` or `FAIL`)

## `parallax start`

Start orchestrator and dashboard in background.

```bash
parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]
```

`parallax start` initializes the global Parallax runtime from `~/.parallax` using the provided runtime flags.
Repository configs are added separately with `parallax register <config-file>`.

Examples:

```bash
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
parallax register ./parallax.yml --env-file ./.env
```

## `parallax register`

Register a repository config in the global Parallax registry.

```bash
parallax register <config-file> [--env-file <path>]
```

Notes:

- stores the config in `~/.parallax/registry.json`
- optional `--env-file` is attached to that registered project config
- if Parallax is already running, the runtime reloads immediately

## `parallax unregister`

Remove a repository config from the global Parallax registry.

```bash
parallax unregister <config-file>
```

Notes:

- fails if the config is not registered
- if Parallax is already running, the runtime reloads immediately

## `parallax stop`

Stop background processes recorded in the running manifest.

```bash
parallax stop
```

## `parallax pending`

List pending plans and optionally approve/reject from CLI.

```bash
parallax pending [--approve <id>] [--reject <id>]
```

Examples:

```bash
parallax pending --approve 3ed59f6e7cea
parallax pending --reject 3ed59f6e7cea
```

## `parallax retry`

Queue a retry for a task.

```bash
parallax retry <task-id>
```

## `parallax cancel`

Cancel a pending or running task.

```bash
parallax cancel <task-id>
```

## `parallax pr-review`

Experimental on-demand trigger for applying open human PR review comments to an existing PR branch.

```bash
parallax pr-review <task-id>
```

Notes:

- prints a prominent experimental warning before triggering
- uses the existing task/project context to locate the repo and branch
- fails unless the task already has a related open PR
- ignores automated/bot review comments
- attempts to resolve the fetched review threads after a successful push

## `parallax logs`

Tail logs from orchestrator API.

```bash
parallax logs [--task <id>]
```

Examples:

```bash
parallax logs
parallax logs --task 3ed59f6e7cea
```

## Data directory files

Parallax stores runtime state in `~/.parallax`.

Common files:

- `running.json`: process manifest (`orchestratorPid`, `uiPid`, ports, start timestamp)
- `parallax.db`: SQLite state database
- `registry.json`: registered repository configs
