# parallax-cli

> WARNING: Parallax is currently in alpha. Expect rough edges, missing polish, and occasional breaking changes.

Parallax is a local-first AI orchestrator for software development tasks. It pulls work from Linear or GitHub Issues, creates isolated worktrees, generates a plan first, waits for approval, then executes changes and opens or updates the related branch and PR while keeping control on your machine.

## Requirements

- Node.js `>= 23.7.0`
- `git`
- `pnpm`
- `gh`
- at least one supported agent CLI (`codex` or `gemini`)

## Install

```bash
npm i -g parallax-cli
```

## Quick start

```bash
parallax preflight
parallax start
parallax status
parallax register ./parallax.yml
```

What this flow does:

- `parallax preflight` checks your local tooling before you start
- `parallax start` launches the background runtime and dashboard
- `parallax status` confirms the runtime is healthy
- `parallax register` adds a repository config to the active Parallax registry

Open the dashboard at `http://localhost:8080` after `parallax start`.

For flags such as custom ports, concurrency, or `--env-file`, use the hosted docs and CLI reference.

## Example `parallax.yml`

```yaml
- id: my-repo
  workspaceDir: /absolute/path/to/local/repo
  pullFrom:
    provider: github
    filters:
      owner: your-github-org-or-user
      repo: your-repo
      state: open
      labels: [ai-ready]
  agent:
    provider: codex
    model: gpt-5.4
    sandbox: true
    disableMcp: true
```

## How it works

- Parallax stores runtime state under `~/.parallax`
- Each registered repository keeps its own `parallax.yml`
- Tasks run in isolated worktrees so changes stay scoped and reviewable
- The dashboard is where you review plans, inspect logs, retry work, and follow PR results
- When a PR receives human review comments, you can trigger:

```bash
parallax pr-review <task-id>
```

## Learn more

Full docs:

- [Getting Started](https://parallax.maxigimenez.xyz/docs/getting-started)
- [CLI Reference](https://parallax.maxigimenez.xyz/docs/cli-reference)

## Feedback and issues

Parallax is still in alpha. If you hit bugs, rough UX, or unclear docs, please open an issue or feature request here:

- [https://github.com/maxigimenez/parallax-cli](https://github.com/maxigimenez/parallax-cli)
