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
parallax start --config ./parallax.yml
```

## Example `parallax.yml` (GitHub pull source)

```yaml
concurrency: 1
logs: [info, success, warn, error]
projects:
  - id: my-repo
    workspaceDir: /absolute/path/to/local/repo
    pullFrom:
      provider: github
      filters:
        owner: your-github-org-or-user
        repo: your-repo
    agent:
      provider: codex
      model: gpt-5.3-codex
      approvalMode: auto_edit
      sandbox: true
      disableMcp: true
```

## Support

For questions, issues, or feedback, reach out via:

- https://github.com/maxigimenez
