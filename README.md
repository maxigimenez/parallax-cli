# parallax-cli

> WARNING: Parallax is currently in alpha. Expect rough edges, missing polish, and occasional breaking changes.

Parallax is a local AI orchestration runtime for software tasks.
It pulls work from Linear or GitHub, creates isolated worktrees, runs an agent in two phases (`plan` then `execute`), and requires explicit approval before implementation.

![](./dashboard.png)

## First version scope

- Plan-first task lifecycle with explicit approval/rejection.
- Issue intake from Linear and GitHub.
- Global runtime state under `~/.parallax`.
- CLI control plane plus dashboard UI.
- Codex, Gemini, and Claude Code adapters (configurable per project).
- Named agents with system prompts and per-label routing.
- Slack bot for plan approvals and task notifications (Socket Mode, no public URL needed).

## Requirements

- Node.js `>= 23.7.0`
- `pnpm` `10.x`
- `git`
- `gh`
- at least one supported agent CLI (`codex`, `gemini`, or `claude`)
- Provider credentials in your shell environment (optional per-project `.env` via `parallax register --env-file`)

## Local development setup

```bash
pnpm install
pnpm parallax preflight
pnpm test
pnpm build
```

## Install global CLI

```bash
npm i -g parallax-cli
parallax preflight
```

## Configuration (`parallax.yml`)

Repository config is stored per repo, then registered into the global Parallax runtime:

```bash
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.yml --env-file ./.env
```

`parallax.yml` is a YAML array. Items are distinguished by key — you can define named agents, a Slack integration, and one or more project entries:

```yaml
# Optional: named agent personalities
- agents:
    - name: developer
      provider: claude-code
      model: claude-opus-4-5
      systemPrompt: |
        You are a senior backend engineer. Prioritize correctness and minimal diffs.
        Always run existing tests before submitting.
    - name: reviewer
      provider: codex
      model: o3

# Optional: Slack bot integration
- slack:
    botToken: xoxb-your-bot-token
    appToken: xapp-your-app-level-token
    channel: "#ai-tasks"

# Project entries
- id: example-repo
  workspaceDir: /absolute/path/to/your/repo
  pullFrom:
    provider: github
    filters:
      owner: your-github-org-or-user
      repo: your-repo
      state: open
      labels: [ai-ready]
  agent:
    name: developer
  agentLabels:
    ai-frontend: reviewer
```

Projects that do not use named agents can still specify `agent.provider` directly — the old format continues to work unchanged.

## Slack bot

Parallax can connect to a Slack workspace using Bolt Socket Mode. When configured, it posts plan-ready notifications with Approve and Reject buttons directly in Slack, posts PR and failure events, and responds to a `/parallax` slash command for retry, cancel, status, and pr-review. Because Socket Mode uses an outbound WebSocket, no public URL is required — it works on localhost and behind NAT.

See [docs/slack-bot.md](docs/slack-bot.md) for the full setup guide.

## CLI

```bash
pnpm parallax --version
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.yml --env-file ./.env
pnpm parallax unregister ./parallax.yml
pnpm parallax stop
pnpm parallax preflight
pnpm parallax status
pnpm parallax pending
pnpm parallax pr-review <task-id>
pnpm parallax retry <task-id>
pnpm parallax cancel <task-id>
pnpm parallax logs --task <task-id>
```

Commands:

- `parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]`
- `parallax register <config-file> [--env-file <path>]`
- `parallax unregister <config-file>`
- `parallax stop`
- `parallax preflight`
- `parallax status`
- `parallax pending [--approve <id>] [--reject <id>]`
- `parallax pr-review <task-id>` (experimental)
- `parallax retry <task-id>`
- `parallax cancel <task-id>`
- `parallax logs [--task <id>]`

## Runtime behavior

1. Pull eligible tasks from provider filters.
2. Generate plan text and persist it.
3. Wait for explicit plan approval from UI or CLI.
4. Execute only approved plan steps.
5. Open/update PR and move task lifecycle state.

## Dashboard behavior

- Pending plans are editable in a textarea and can be approved/rejected in-place.
- Task logs stream in real time.
- File changes are shown as clickable entries with side-panel diff view.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

For full user guides, see [docs/README.md](docs/README.md).

## Publish Global CLI (`parallax-cli`)

Parallax is published as a single global CLI package:

```bash
npm i -g parallax-cli
```

Releases are published through the manual GitHub Actions workflow:

- open the `Release parallax-cli` workflow in GitHub Actions
- trigger it with `Run workflow`
- the workflow publishes the exact version already set in [`packages/cli/package.json`](packages/cli/package.json)

Repository requirement:

- configure npm trusted publishing for this repository/package in npm

Before triggering the release, update the version in:

```bash
packages/cli/package.json
```

Then on Raspberry Pi / any machine:

```bash
npm i -g parallax-cli
parallax preflight
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
parallax status
parallax register ./parallax.yml
```

Default runtime locations and ports:

- runtime state: `~/.parallax`
- API: `http://localhost:3000`
- dashboard: `http://localhost:8080`

## License

MIT. See [LICENSE](LICENSE).
