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

Start orchestrator in background.

```bash
parallax start [--config <path>] [--env-file <path>]
```

Config behavior:

- if `--config` is passed, that file is used
- if `--config` is omitted, Parallax uses `./parallax.yml` from your current working directory

Examples:

```bash
parallax start --config ./parallax.yml --env-file ./.env
parallax start
```

## `parallax stop`

Stop background processes recorded in the running manifest.

```bash
parallax stop [--force]
```

`--force` sends `SIGKILL` if graceful stop fails.

## `parallax pending`

List pending plans and optionally approve/reject from CLI.

```bash
parallax pending [--api <base>] [--config <path>] [--approve <id|all>] [--reject <id>] [--json]
```

Examples:

```bash
parallax pending --approve all
parallax pending --approve 3ed59f6e7cea
parallax pending --reject 3ed59f6e7cea
parallax pending --json
```

## `parallax retry`

Queue a retry for a task.

```bash
parallax retry <task-id> [--api <base>] [--mode <full|execution>]
```

Modes:

- `full`: regenerate plan and run again
- `execution`: rerun execution using existing approved plan

## `parallax cancel`

Cancel a pending or running task.

```bash
parallax cancel <task-id> [--api <base>]
```

## `parallax logs`

Tail logs from orchestrator API.

```bash
parallax logs [--api <base>] [--task <id>] [--since <epoch-ms>]
```

Examples:

```bash
parallax logs
parallax logs --task 3ed59f6e7cea
parallax logs --since 1741200000000
```

## Data directory files

Parallax stores runtime state in `~/.parallax`.

Common files:

- `running.json`: process manifest (`orchestratorPid`, config path, start timestamp)
- `parallax.db`: SQLite state database
