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
parallax start [--config <path>] [--data-dir <path>]
```

Config behavior:

- if `--config` is passed, that file is used
- if `--config` is omitted, Parallax uses `./parallax.yml` from your current working directory

Examples:

```bash
parallax start --config ./parallax.yml --data-dir ./.parallax
parallax start --data-dir ./.parallax
```

## `parallax stop`

Stop background processes recorded in the running manifest.

```bash
parallax stop [--data-dir <path>] [--force]
```

`--force` sends `SIGKILL` if graceful stop fails.

## `parallax pending`

List pending plans and optionally approve/reject from CLI.

```bash
parallax pending [--api <base>] [--config <path>] [--data-dir <path>] [--approve <id|all>] [--reject <id> --reason <text>] [--json]
```

Examples:

```bash
parallax pending --data-dir ./.parallax
parallax pending --approve all
parallax pending --approve 3ed59f6e7cea
parallax pending --reject 3ed59f6e7cea --reason "Missing rollback plan"
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

By default, data is stored in `./.parallax` unless `--data-dir` is provided.

Common files:

- `running.json`: process manifest (`orchestratorPid`, config path, start timestamp)
- `parallax.db`: SQLite state database
