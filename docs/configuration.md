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

- allowed values: `codex`, `gemini`

#### agent.model (optional)

- model string forwarded to the selected agent provider

#### agent.approvalMode (optional)

- allowed values: `default`, `auto_edit`
- defaults to `default`

#### agent.sandbox (optional)

- boolean
- defaults to `true`

#### agent.disableMcp (optional)

- boolean
- defaults to `false`

#### agent.allowedTools (optional)

- array of non-empty strings

#### agent.extraArgs (optional)

- array of non-empty strings

## Example: GitHub

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
    sandbox: true
```

## Validation failures you may see

- `Invalid parallax config`
- `project.workspaceDir ... must be an absolute path`
- `Unsupported pull provider`
- `Unsupported agent provider`
- `Duplicate project id`
