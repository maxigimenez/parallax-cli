# Parallax

Parallax is a local AI orchestration runtime for software tasks.
It pulls work from Linear or GitHub, creates isolated worktrees, runs an agent in two phases (`plan` then `execute`), and requires explicit approval before implementation.

## First version scope

- Plan-first task lifecycle with explicit approval/rejection.
- Issue intake from Linear and GitHub.
- Global runtime state under `~/.parallax`.
- CLI control plane plus dashboard UI.
- Codex and Gemini adapters (configurable per project).

## Requirements

- Node.js `>= 22`
- `pnpm` `10.x`
- `git`
- Provider credentials in your shell environment (optional per-project `.env` via `parallax register --env-file`)

## Install

```bash
pnpm install
pnpm test
pnpm build
```

## Configuration (`parallax.yml`)

Repository config is stored per repo, then registered into the global Parallax runtime:

```bash
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.yml --env-file ./.env
```

`parallax.yml` is a YAML array of project entries:

```yaml
- id: taplands
  workspaceDir: /Users/maxi/projects/taplands
  pullFrom:
    provider: github
    filters:
      owner: maxigimenez
      repo: taplands
      state: open
      labels: [ai-ready]
  agent:
    provider: codex
    model: gpt-5.4
    sandbox: true
    disableMcp: true
```

## CLI

```bash
pnpm parallax --version
pnpm parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
pnpm parallax register ./parallax.yml --env-file ./.env
pnpm parallax unregister ./parallax.yml
pnpm parallax stop
pnpm parallax preflight
pnpm parallax pending
pnpm parallax retry ENG-123
pnpm parallax cancel ENG-123
pnpm parallax logs --task ENG-123
```

Commands:

- `parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]`
- `parallax register <config-file> [--env-file <path>]`
- `parallax unregister <config-file>`
- `parallax stop`
- `parallax preflight`
- `parallax pending [--approve <id>] [--reject <id>]`
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
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
parallax register ./parallax.yml
```

Default runtime locations and ports:

- runtime state: `~/.parallax`
- API: `http://localhost:3000`
- dashboard: `http://localhost:8080`

## License

MIT. See [LICENSE](LICENSE).
