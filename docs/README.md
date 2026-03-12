# Parallax Documentation

This documentation is for people trying Parallax for the first time and running it locally from the CLI.

## Documentation map

- [Getting Started](./getting-started.md): install Parallax, start it, register your repo, and open the dashboard.
- [Configuration Reference](./configuration.md): what goes in `parallax.yml` and how to register it.
- [CLI Reference](./cli-reference.md): the day-to-day commands you will actually run.
- [Troubleshooting](./troubleshooting.md): fixes for common setup and runtime problems.

## What Parallax does

- Parallax pulls tasks from Linear or GitHub.
- Each task runs in its own local isolated worktree.
- Parallax generates a plan first, then waits for approval before making changes.
- The dashboard is where you review plans, watch logs, retry work, and inspect PR results.
- Local state lives under `~/.parallax`.

## Recommended first run

1. Install: `npm i -g parallax-cli`
2. Validate dependencies: `parallax preflight`
3. Create `parallax.yml`
4. Start Parallax: `parallax start`
5. Check runtime status: `parallax status`
6. Register config: `parallax register ./parallax.yml`
7. Open dashboard: `http://localhost:8080`
