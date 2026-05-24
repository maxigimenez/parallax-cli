# CLI Reference

These are the commands most users will use day to day.

## Global usage

```bash
parallax --version
parallax --help
```

## parallax init

Run the interactive setup wizard to configure Parallax for the first time or add another project.

```bash
parallax init
```

The wizard covers: project ID, workspace directory, issue source (GitHub or Linear), agent selection, optional secrets, and optional Slack configuration. All settings are saved to `~/.parallax/config.json`.

If a config already exists, the wizard offers to add another project, open the dashboard, or exit.

## parallax preflight

Validate local prerequisites before first run.

```bash
parallax preflight
```

Notes:

- no flags accepted
- returns non-zero exit code when required checks fail
- prints a final verdict (`PASS` or `FAIL`)

## parallax status

Check whether the current Parallax runtime is healthy.

```bash
parallax status
```

Notes:

- no flags accepted
- prints a clear message when Parallax is not running
- shows orchestrator PID, dashboard URL, and configured projects when healthy
- prints orchestrator diagnostics when the runtime has issues

## parallax start

Start orchestrator and dashboard in background.

```bash
parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]
```

`parallax start` reads project and secret configuration from `~/.parallax/config.json`.
If no projects are configured, it exits with an error: run `parallax init` first.

Examples:

```bash
parallax start
parallax start --server-api-port 9371 --server-ui-port 9372 --concurrency 2
```

## parallax stop

Stop background processes recorded in the running manifest.

```bash
parallax stop
```

## parallax open

Open the dashboard in your default browser.

```bash
parallax open
```

Reads the UI port from `~/.parallax/running.json`. Prints the URL if the orchestrator is not running.

## parallax retry

Queue a retry for a task.

```bash
parallax retry <task-id>
```

## parallax cancel

Cancel a pending or running task.

```bash
parallax cancel <task-id>
```

## parallax pr-review

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

## parallax logs

Tail new logs from orchestrator API starting from when the command begins.

```bash
parallax logs [--task <id>]
```

Examples:

```bash
parallax logs
parallax logs --task 3ed59f6e7cea
```

## Runtime files

Parallax stores runtime state in `~/.parallax`.

Common files:

- `config.json`: project and integration configuration (managed by `parallax init` and the dashboard)
- `running.json`: process manifest (`orchestratorPid`, `uiPid`, ports, start timestamp)
- `parallax.db`: SQLite state database
