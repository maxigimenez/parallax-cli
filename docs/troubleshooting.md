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

### `Config path not found`

You started with `--config` pointing to a missing file, or ran start without `--config` from a directory that does not contain `parallax.yml`.

Fix:

```bash
parallax start --config ./parallax.yml
# or run from the directory that contains parallax.yml:
parallax start
```

### API did not become healthy

Possible causes:

- port `3000` already in use
- config validation failed
- provider auth missing in environment

Check:

```bash
parallax stop --force
parallax start --config ./parallax.yml
```

## Task actions fail (`approve`, `retry`, `cancel`)

### `Unknown task id`

Use Parallax task id from dashboard or:

```bash
parallax pending
```

### `Execution retry requires an approved plan`

Use:

```bash
parallax retry <task-id> --mode full
```

or approve the plan first, then retry with `--mode execution`.

## Dashboard not reachable from another machine on LAN

Check:

- Parallax is running
- host machine firewall allows inbound TCP `3000`
- both devices are on same network
- you are using `http://<host-ip>:3000`

## Clean reset

If local runtime state is corrupted:

```bash
parallax stop --force
rm -rf ~/.parallax
parallax start --config ./parallax.yml
```

Warning: deleting data dir removes local task/runtime history.
