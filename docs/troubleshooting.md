# Troubleshooting

## `parallax preflight` fails

### Node.js version check failed

Use Node.js `>= 22` (recommended: latest LTS), then rerun `parallax preflight`.

### `gh auth status` failed

Run:

```bash
gh auth login
gh auth status
```

### Neither `codex` nor `gemini` found

Install at least one agent CLI and ensure it is on your `PATH`.

### `git` or `pnpm` not found

Install missing tool and reopen terminal session.

## `parallax start` fails

### No registered configs

Fix:

```bash
parallax start
parallax register ./parallax.yml
```

Parallax can run with zero registered configs, but it will not poll any projects until at least one config is registered.

### API did not become healthy

Possible causes:

- port `3000` already in use
- config validation failed
- provider auth missing in environment

Check:

```bash
parallax stop
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
```

## Task actions fail (`approve`, `retry`, `cancel`)

### `Unknown task id`

Use Parallax task id from dashboard or:

```bash
parallax pending
```

### Task keeps failing after retry

Approve the task plan first if it is still pending, then run:

```bash
parallax retry <task-id>
```

## Clean reset

If local runtime state is corrupted:

```bash
parallax stop
rm -rf ~/.parallax
parallax start
parallax register ./parallax.yml
```

Warning: deleting data dir removes local task/runtime history.
