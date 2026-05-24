# Parallax Documentation

This documentation is for people trying Parallax for the first time and running it locally from the CLI.

## Documentation map

- [Getting Started](./getting-started.md): install Parallax, run the setup wizard, and open the dashboard.
- [Configuration Reference](./configuration.md): how Parallax stores config and what each field means.
- [CLI Reference](./cli-reference.md): the day-to-day commands you will actually run.
- [Task Lifecycle](./task-lifecycle.md): how Parallax processes tasks from pull to PR.
- [Slack Bot](./slack-bot.md): connect Parallax to Slack for plan approvals and task notifications.
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
3. Run the setup wizard: `parallax init`
4. Start Parallax: `parallax start`
5. Open the dashboard: `parallax open`
6. Check runtime status: `parallax status`
