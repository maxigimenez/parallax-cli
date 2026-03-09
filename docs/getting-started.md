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
- id: web-app
  workspaceDir: /absolute/path/to/your/repo
  pullFrom:
    provider: linear
    filters:
      team: ENG
      state: Todo
  agent:
    provider: codex
    model: gpt-5.4
    sandbox: true
    disableMcp: true
```

For full field behavior, see [Configuration Reference](./configuration.md).

## 5. Start Parallax

Start the runtime, then register the repository config:

```bash
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
parallax register ./parallax.yml --env-file ./.env
```

## 6. Open dashboard

Default URL:

- API: `http://localhost:3000`
- UI: `http://localhost:8080`

Parallax stores runtime state in `~/.parallax`.

## 7. Stop Parallax

```bash
parallax stop
```
