# Getting Started

Parallax runs as a local service on your machine. You start it once, register repositories with `parallax.yml`, then use the dashboard to review plans and task output.

## 1. Install

Requirements:

- Node.js `>= 23.7.0`

Install Parallax globally:

```bash
npm i -g parallax-cli
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

`preflight` checks the tools Parallax needs before you start:

- Node.js version (`>= 23.7.0`)
- `git` CLI
- `pnpm` CLI
- `gh` CLI
- `gh auth status`
- `codex` CLI (optional)
- `gemini` CLI (optional)
- at least one agent CLI (`codex` or `gemini`) is available

If a required check fails, fix it before moving on.

## 3. Authenticate the tools Parallax depends on

GitHub CLI:

```bash
gh auth login
gh auth status
```

Provider credentials:

- export required provider credentials in your shell environment before starting Parallax.
- use `parallax register ./parallax.yml --env-file ./.env` if a project should load credentials from a repo-specific env file.

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
```

For field details and more examples, see [Configuration Reference](./configuration.md).

## 5. Start Parallax

Start the runtime first, then register the repository config:

```bash
parallax start
parallax register ./parallax.yml --env-file ./.env
```

What this does:

- `parallax start` launches the background API and dashboard from `~/.parallax`
- `parallax register` adds this repository to the active project registry

## 6. Open dashboard

Default URL:

- API: `http://localhost:3000`
- UI: `http://localhost:8080`

Parallax stores runtime state in `~/.parallax`.

## 7. Check runtime status

Use:

```bash
parallax status
```

This reports whether the local runtime is healthy and surfaces orchestrator issues when present.

## 8. Stop Parallax

```bash
parallax stop
```
