# Parallax

Parallax is a local AI orchestration runtime for software tasks.
It pulls work from Linear or GitHub, creates isolated worktrees, runs an agent in two phases (`plan` then `execute`), and requires explicit approval before implementation.

## First version scope

- Plan-first task lifecycle with explicit approval/rejection.
- Issue intake from Linear and GitHub.
- Local SQLite state under a project data directory.
- CLI control plane plus dashboard UI.
- Codex and Gemini adapters (configurable per project).

## Requirements

- Node.js `>=23.7.0`
- `pnpm` `10.x`
- `git`
- Provider credentials in your shell environment (no repo `.env` requirement)

## Install

```bash
pnpm install
pnpm test
pnpm build
```

## Configuration (`parallax.yml`)

```yaml
concurrency: 2
logs: [info, success, warn, error]
projects:
  - id: my-app
    workspaceDir: /absolute/path/to/repo
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

## CLI

```bash
pnpm parallax --version
pnpm parallax start --config ./parallax.yml --data-dir ./.parallax
pnpm parallax start --data-dir ./.parallax
pnpm parallax stop --data-dir ./.parallax
pnpm parallax preflight
pnpm parallax pending --data-dir ./.parallax
pnpm parallax retry ENG-123 --mode execution
pnpm parallax cancel ENG-123
pnpm parallax logs --task ENG-123
```

Commands:

- `parallax start [--config <path>] [--data-dir <path>]`
- `parallax stop [--data-dir <path>] [--force]`
- `parallax preflight`
- `parallax pending [--api <base>] [--config <path>] [--data-dir <path>] [--approve <id|all>] [--reject <id> --reason <text>] [--json]`
- `parallax retry <task-id> [--api <base>] [--mode <full|execution>]`
- `parallax cancel <task-id> [--api <base>]`
- `parallax logs [--api <base>] [--task <id>] [--since <epoch-ms>]`

## Runtime behavior

1. Pull eligible tasks from provider filters.
2. Generate plan text and persist it.
3. Wait for explicit plan approval from UI or CLI.
4. Execute only approved plan steps.
5. Open/update PR and move task lifecycle state.

PR review rework is intentionally strict: follow-up execution only triggers from explicit command comments (`parallax fix all comments`), not generic automation comments (for example deployment bots).

## Dashboard behavior

- Pending plans are editable in a textarea and can be approved/rejected in-place.
- Task logs stream in real time.
- File changes are shown as clickable entries with side-panel diff view.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

For full user guides, see [docs/README.md](docs/README.md).

## Publish Single NPM Package (`parallax-ai`)

Parallax can be published as one global package so users can run:

```bash
npm i -g parallax-ai
```

Release steps:

```bash
pnpm install
pnpm prepare:release
cd .release
npm_config_cache=.npm-cache npm pack
# inspect tarball contents, then:
npm_config_cache=.npm-cache npm publish --access public
```

Then on Raspberry Pi / any machine:

```bash
npm i -g parallax-ai
parallax preflight
parallax start --config ./parallax.yml --data-dir ./.parallax
```

The dashboard is served by the orchestrator at `http://<host>:3000` (LAN accessible if host firewall allows it).

## License

MIT. See [LICENSE](LICENSE).
