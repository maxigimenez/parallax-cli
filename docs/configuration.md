# Configuration Reference

Parallax configuration is loaded from `parallax.yml`.

## Minimal valid config

```yaml
projects:
  - id: example
    workspaceDir: /absolute/path/to/repo
    pullFrom:
      provider: linear
      filters:
        team: ENG
    agent:
      provider: codex
```

## Root fields

### `projects` (required)

- type: array
- must contain at least one project
- each project `id` must be unique

### `concurrency` (optional)

- type: integer
- allowed range: `1..16`
- default: `1`
- controls how many tasks can be processed concurrently

### `logs` (optional)

- type: array of `info | success | warn | error`
- default: `["info", "success", "warn", "error"]`
- duplicate values are removed

### `server` (optional)

- type: object
- defaults:
  - `apiPort: 3000`
  - `uiPort: 8080`
- `apiPort` and `uiPort` must be different integers in the range `1..65535`

## Project fields

### `id` (required)

- non-empty string
- unique across all projects

### `workspaceDir` (required)

- absolute path to an existing local repo directory
- relative paths are rejected

### `pullFrom` (required)

#### `pullFrom.provider` (required)

- allowed values: `linear`, `github`

#### `pullFrom.filters` (required object)

Common fields:

- `team`
- `state`
- `labels`
- `project`
- `owner`
- `repo`

Provider-specific requirement:

- for `github`, both `owner` and `repo` are required

### `agent` (required)

#### `agent.provider` (required)

- allowed values: `codex`, `gemini`

#### `agent.model` (optional)

- model string forwarded to the selected agent provider

#### `agent.approvalMode` (optional)

- allowed values: `default`, `auto_edit`

#### `agent.sandbox` (optional)

- boolean

#### `agent.disableMcp` (optional)

- boolean

#### `agent.allowedTools` (optional)

- array of non-empty strings

#### `agent.extraArgs` (optional)

- array of non-empty strings

## Full example: Linear

```yaml
server:
  apiPort: 3000
  uiPort: 8080
concurrency: 2
logs: [info, success, warn, error]
projects:
  - id: platform-api
    workspaceDir: /Users/you/src/platform-api
    pullFrom:
      provider: linear
      filters:
        team: API
        state: Todo
    agent:
      provider: codex
      model: gpt-5.3-codex
      approvalMode: auto_edit
      sandbox: true
      disableMcp: true
```

## Full example: GitHub

```yaml
server:
  apiPort: 3000
  uiPort: 8080
concurrency: 1
projects:
  - id: ui-repo
    workspaceDir: /Users/you/src/ui-repo
    pullFrom:
      provider: github
      filters:
        owner: acme
        repo: ui-repo
        labels: [parallax]
    agent:
      provider: gemini
      model: gemini-2.5-pro
```

## Validation failures you may see

- `project.workspaceDir ... must be an absolute path`
- `project.workspaceDir ... does not exist or is not a directory`
- `Unsupported pull provider`
- `Unsupported agent provider`
- `Duplicate project id`
- `concurrency ... must be an integer between 1 and 16`
- `server.apiPort and server.uiPort ... must be different`
