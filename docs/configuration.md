# Configuration Reference

Parallax project configuration is stored per repository in `parallax.yml`, then registered globally with:

```bash
parallax register ./parallax.yml
parallax register ./parallax.yml --env-file ./.env
```

Runtime options such as API/UI ports and concurrency are not configured in `parallax.yml`.
Those are set when you start Parallax:

```bash
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
```

## File format

`parallax.yml` is a YAML array of project entries.

## Minimal valid config

```yaml
- id: example
  workspaceDir: /absolute/path/to/repo
  pullFrom:
    provider: linear
    filters:
      team: ENG
  agent:
    provider: codex
```

## Project fields

### id (required)

- non-empty string
- must be unique across all registered configs

### workspaceDir (required)

- absolute path to a local repo directory
- relative paths are rejected

### pullFrom (required)

#### pullFrom.provider (required)

- allowed values: `linear`, `github`

#### pullFrom.filters (required object)

Common fields:

- `team`
- `state`
- `labels`
- `project`
- `owner`
- `repo`

Provider-specific requirement:

- for `github`, both `owner` and `repo` are required

### agent (required)

#### agent.provider (required)

- allowed values: `codex`, `gemini`, `claude-code`

#### agent.model (optional)

- model string forwarded to the selected agent provider

Parallax always runs supported agents in a sandbox. Approval behavior and MCP/runtime flags are built in and are not configured in `parallax.yml`.

## Example: GitHub

```yaml
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
    provider: codex
    model: gpt-5.4
```

## Example: Linear

```yaml
- id: platform-api
  workspaceDir: /Users/you/src/platform-api
  pullFrom:
    provider: linear
    filters:
      team: API
      state: Todo
  agent:
    provider: gemini
    model: gemini-2.5-pro
```

## Named agents

### The `agents:` top-level item

`parallax.yml` supports an optional top-level `agents:` item that defines reusable agent personalities. Projects reference them by name instead of specifying a provider directly.

```yaml
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
      systemPrompt: |
        You are a strict code reviewer. Focus on security, edge cases, and regressions.
```

#### Agent fields

##### name (required)

- non-empty string
- must be unique across the `agents:` list
- used to reference this agent from project entries

##### provider (required)

- allowed values: `codex`, `gemini`, `claude-code`

##### model (optional)

- model string forwarded to the selected agent provider

##### systemPrompt (optional)

- multi-line string prepended to every prompt sent to this agent
- use it to encode team conventions, preferred patterns, or persona instructions

### Referencing a named agent from a project entry

Use `agent.name` instead of `agent.provider` on a project entry:

```yaml
- id: my-repo
  workspaceDir: /path/to/repo
  pullFrom:
    provider: github
    filters:
      owner: myorg
      repo: my-repo
      labels: [ai-ready]
  agent:
    name: developer
```

`agent.provider` continues to work as before for projects that do not need a named agent.

### Per-label agent routing (`agentLabels`)

`agentLabels` is an optional map on a project entry. It routes tickets with specific labels to a named agent, overriding the project's default agent for those tickets.

```yaml
- id: my-repo
  workspaceDir: /path/to/repo
  pullFrom:
    provider: github
    filters:
      owner: myorg
      repo: my-repo
      labels: [ai-ready]
  agent:
    name: developer
  agentLabels:
    ai-frontend: reviewer
    ai-security: reviewer
```

In this example, tickets labeled `ai-frontend` or `ai-security` are handled by the `reviewer` agent; all other tickets go to `developer`.

## Slack bot integration

### The `slack:` top-level item

Add a `slack:` item to `parallax.yml` to enable the Slack bot integration:

```yaml
- slack:
    botToken: xoxb-your-bot-token
    appToken: xapp-your-app-level-token
    channel: "#ai-tasks"
```

#### Slack fields

##### botToken (required)

- Bot User OAuth Token from your Slack app
- starts with `xoxb-`
- requires `chat:write` and `commands` bot token scopes

##### appToken (required)

- App-Level Token from your Slack app
- starts with `xapp-`
- requires `connections:write` scope
- used for Socket Mode (outbound WebSocket; no public URL needed)

##### channel (required)

- the Slack channel name where notifications are posted (e.g. `"#ai-tasks"`)
- the bot must be invited to this channel before it can post

See [Slack Bot](./slack-bot.md) for the full setup guide.

## Complete example

The following shows all three item types in a single `parallax.yml`:

```yaml
# Named agent personalities
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
      systemPrompt: |
        You are a strict code reviewer. Focus on security, edge cases, and regressions.

# Slack bot integration
- slack:
    botToken: xoxb-your-bot-token
    appToken: xapp-your-app-level-token
    channel: "#ai-tasks"

# Project entries
- id: my-repo
  workspaceDir: /path/to/repo
  pullFrom:
    provider: github
    filters:
      owner: myorg
      repo: my-repo
      state: open
      labels: [ai-ready]
  agent:
    name: developer
  agentLabels:
    ai-frontend: reviewer
    ai-security: reviewer

- id: platform-api
  workspaceDir: /Users/you/src/platform-api
  pullFrom:
    provider: linear
    filters:
      team: API
      state: Todo
  agent:
    provider: gemini
    model: gemini-2.5-pro
```

## Validation failures you may see

- `Invalid parallax config`
- `project.workspaceDir ... must be an absolute path`
- `Unsupported pull provider`
- `Unsupported agent provider`
- `Duplicate project id`
