# Troubleshooting

## parallax preflight fails

### Node.js version check failed

Use Node.js `>= 23.7.0`, then rerun `parallax preflight`. Older Node versions can fail when Parallax initializes SQLite.

### gh auth status failed

Run:

```bash
gh auth login
gh auth status
```

### None of codex, gemini, or claude found

Install at least one agent CLI and ensure it is on your `PATH`.

### git or pnpm not found

Install missing tool and reopen terminal session.

## parallax start fails

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

## Dashboard cannot be reached over the local network

Parallax binds to localhost unless network access is explicitly enabled:

```bash
parallax stop
parallax start --network-access
```

Use the network URL printed at startup or by `parallax status`, for example
`http://cerebro.local:9372`.

### Vite says the host is not allowed

An error such as:

```text
Blocked request. This host ("cerebro.local") is not allowed.
```

means the development dashboard was started without network mode. Restart the full Parallax runtime
with `parallax start --network-access`; do not edit the installed `vite.config.js`.

### The `.local` hostname does not resolve

On macOS, check the Bonjour hostname:

```bash
scutil --get LocalHostName
```

Try `<LocalHostName>.local`, or use the Mac's LAN IP address instead. Ensure both devices are on the
same network and that client isolation is disabled on the router or access point.

### The hostname resolves but the connection is refused

- Confirm `parallax status` shows a network dashboard URL.
- Allow incoming connections for Node.js in **System Settings → Network → Firewall**.
- Confirm ports `9371` and `9372`, or your custom API/UI ports, are not blocked by host or network
  firewall rules.

Network access has no authentication. Enable it only on a trusted internal network because remote
dashboard users can approve tasks and modify configuration and secrets.

## Task actions fail

### Unknown task id

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
