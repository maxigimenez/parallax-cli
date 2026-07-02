# parallax-cli

> WARNING: Parallax is currently in alpha. Expect rough edges, missing polish, and occasional breaking changes.

Parallax is a local-first AI orchestrator for software development tasks. It pulls work from Linear or GitHub Issues, creates isolated worktrees, generates a plan first, waits for approval, then executes changes and opens or updates the related branch and PR while keeping control on your machine.

## Requirements

- Node.js `>= 23.7.0`
- `git`
- `pnpm`
- `gh`
- at least one supported agent CLI (`codex`, `gemini`, or `claude`)

## Install

```bash
npm i -g parallax-cli
```

## Quick start

```bash
parallax preflight
parallax init
parallax start
parallax open
```

What this flow does:

- `parallax preflight` checks your local tooling before you start
- `parallax init` runs the interactive setup wizard (project, issue source, agent, optional Slack)
- `parallax start` launches the background runtime and dashboard
- `parallax open` opens the dashboard in your browser

The dashboard is at `http://localhost:9372` after `parallax start`.

For a trusted internal network, `parallax start --network-access` also exposes the dashboard through
the machine hostname or LAN IP. This mode is unauthenticated; localhost-only access remains the
default.

## How it works

- Parallax stores all configuration and runtime state under `~/.parallax`
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
