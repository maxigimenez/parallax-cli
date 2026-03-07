# Getting Started

## 1. Install

Requirements:

- Node.js `>= 22`

Install Parallax globally:

```bash
npm i -g parallax-ai@alpha
```

Confirm command is available:

```bash
parallax --version
```

## 2. Verify local prerequisites

Run:

```bash
parallax preflight
```

`preflight` checks:

- Node.js version (`>= 22`)
- `git` CLI
- `pnpm` CLI
- `gh` CLI
- `gh auth status`
- `codex` CLI (optional)
- `gemini` CLI (optional)
- at least one agent CLI (`codex` or `gemini`) is available

If a required check fails, Parallax will not run reliably.

## 3. Authenticate external tools

GitHub CLI:

```bash
gh auth login
gh auth status
```

Provider credentials:

- export required provider credentials in your shell environment before starting Parallax.
- keep credentials outside the repository when possible.

## 4. Create your config (`parallax.yml`)

Example:

```yaml
concurrency: 2
logs: [info, success, warn, error]
projects:
  - id: web-app
    workspaceDir: /absolute/path/to/your/repo
    pullFrom:
      provider: linear
      filters:
        team: ENG
        state: Todo
    agent:
      provider: codex
      model: gpt-5.3-codex
      approvalMode: auto_edit
      sandbox: true
      disableMcp: true
```

For full field behavior, see [Configuration Reference](./configuration.md).

## 5. Start Parallax

Start with explicit config:

```bash
parallax start --config ./parallax.yml --data-dir ./.parallax
```

If `--config` is omitted, Parallax reads `./parallax.yml` from the current working directory:

```bash
parallax start --data-dir ./.parallax
```

## 6. Open dashboard

Default URL:

- `http://localhost:3000`

LAN access:

- orchestrator listens on `0.0.0.0:3000`
- other devices on your local network can access it if your OS firewall allows inbound traffic on port `3000`

## 7. Stop Parallax

```bash
parallax stop --data-dir ./.parallax
```

Force stop when needed:

```bash
parallax stop --data-dir ./.parallax --force
```
