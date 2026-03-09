# parallax_

> WARNING: This package is in active development and may contain breaking changes or unstable behavior.

Parallax is a local AI orchestrator for software development tasks.

## Install

```bash
npm i -g parallax-ai@alpha
```

Requirements:

- Node.js `>= 22`

## Basic Usage

```bash
parallax preflight
parallax start --server-api-port 3000 --server-ui-port 8080 --concurrency 2
parallax register ./parallax.yml --env-file ./.env
```

## Example `parallax.yml` (GitHub pull source)

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

Parallax stores runtime state under `~/.parallax` and keeps registered configs in `~/.parallax/registry.json`.

## Support

For questions, issues, or feedback, reach out via:

- https://github.com/maxigimenez
