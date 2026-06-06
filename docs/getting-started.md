# Getting Started

Parallax runs as a local service on your machine. Run the setup wizard once, then use the dashboard to review plans and task output.

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
- `claude` CLI (optional)
- at least one agent CLI is available

If a required check fails, fix it before moving on.

## 3. Authenticate the tools Parallax depends on

GitHub CLI:

```bash
gh auth login
gh auth status
```

If you plan to use Linear, have your API key ready — the setup wizard will ask for it.

## 4. Run the setup wizard

```bash
parallax init
```

The wizard walks through:

1. **Project ID** — a short identifier (e.g. `my-app`)
2. **Workspace directory** — absolute path to your local git repository
3. **Issue source** — GitHub Issues or Linear, with owner/repo or team filter
4. **Label filter** — optional, to narrow which issues Parallax picks up (e.g. `ai-ready`)
5. **AI agent** — Claude Code, OpenAI Codex, or Google Gemini
6. **Model override** — optional, to pin a specific model version
7. **Secrets** — Linear API key if you selected Linear and it is not already stored
8. **Slack notifications** — optional, configures bot/app tokens and a notification channel

Configuration is saved to `~/.parallax/config.json`. You can manage projects and integrations later from the dashboard.

## 5. Start Parallax

```bash
parallax start
```

What this does:

- launches the background orchestrator and dashboard
- reads projects and secrets from `~/.parallax/config.json`

### Optional: access a headless machine over the local network

On a trusted internal network, start Parallax with:

```bash
parallax start --network-access
```

The startup output includes a network dashboard URL, for example:

```text
http://cerebro.local:9372
```

You can also use the machine's LAN IP address. This mode has no authentication: anyone who can
reach it can approve tasks and modify Parallax configuration and secrets. Without
`--network-access`, both the dashboard and API remain bound to localhost.

## 6. Open the dashboard

```bash
parallax open
```

Or open `http://localhost:9372` in your browser.

For a remote browser, use the network URL printed by `parallax start --network-access`.

The dashboard has three sections (left navigation):

- **Tasks** — live task list, plan approval, log streaming
- **Projects** — add, edit, and remove project configurations
- **Integrations** — configure GitHub, Linear, and Slack (including API keys)

## 7. Check runtime status

```bash
parallax status
```

Reports whether the local runtime is healthy and lists your configured projects.

## 8. Stop Parallax

```bash
parallax stop
```
