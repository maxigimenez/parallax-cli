# Slack Bot

Parallax can connect to a Slack workspace to post plan notifications, accept approvals, and respond to slash commands — all over an outbound WebSocket connection. No public URL is required.

## What the Slack bot does

- **Plan-ready notifications**: when Parallax finishes generating a plan, it posts a Block Kit message to your channel showing the agent identity, task details, and plan text. The message includes Approve and Reject buttons so you can approve plans without opening the dashboard.
- **Execution started**: posts when the agent begins implementation work.
- **PR created**: posts the PR URL when a pull request is opened.
- **Failed / Canceled**: posts the error detail when a task fails or is canceled.
- **`/parallax` slash command**: lets you act on tasks directly from Slack.

### `/parallax` slash command subcommands

| Subcommand | Effect |
|---|---|
| `/parallax retry <taskId>` | Queues a retry for a failed or rejected task |
| `/parallax cancel <taskId>` | Cancels a pending or running task |
| `/parallax status <taskId>` | Prints the current task status and plan state |
| `/parallax pr-review <taskId>` | Triggers an on-demand PR review |

Task IDs appear in plan-ready messages and in the dashboard.

## How it works

Parallax uses Bolt **Socket Mode**: it opens an outbound WebSocket to Slack's API servers. There is no inbound HTTP server to expose, no public URL to configure, and no need to punch through a firewall or NAT. It works on localhost and on air-gapped machines as long as they have outbound HTTPS/WSS access.

## Step 1 — Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**.
2. Choose **From scratch**.
3. Enter an app name (e.g. `Parallax`) and select the workspace you want to install it in.
4. Click **Create App**.

## Step 2 — Enable Socket Mode and generate an App-Level Token

1. In the left sidebar, click **Socket Mode**.
2. Toggle **Enable Socket Mode** on.
3. You will be prompted to generate an App-Level Token. Give it a name (e.g. `parallax-socket`) and add the `connections:write` scope.
4. Click **Generate**. Copy the token — it starts with `xapp-`. You will not be able to view it again.

## Step 3 — Add OAuth scopes

1. In the left sidebar, click **OAuth & Permissions**.
2. Scroll to **Bot Token Scopes** and add:
   - `chat:write`
   - `commands`
3. Click **Save Changes**.

## Step 4 — Install the app to your workspace

1. Still on the **OAuth & Permissions** page, scroll to the top and click **Install to Workspace**.
2. Review the permissions and click **Allow**.
3. Copy the **Bot User OAuth Token** — it starts with `xoxb-`.

## Step 5 — Create the `/parallax` slash command

1. In the left sidebar, click **Slash Commands**, then **Create New Command**.
2. Fill in:
   - **Command**: `/parallax`
   - **Request URL**: any valid URL (e.g. `https://example.com/slack`) — Socket Mode intercepts delivery before this URL is ever called.
   - **Short Description**: `Manage Parallax tasks`
3. Click **Save**.

## Step 6 — Invite the bot to your channel

In Slack, open the channel you want Parallax to post in and run:

```
/invite @Parallax
```

Replace `Parallax` with whatever you named your app.

## Step 7 — Configure Slack in Parallax

Run the setup wizard and follow the Slack prompts:

```bash
parallax init
```

Or, if Parallax is already running, open the dashboard and go to **Integrations → Slack**. Fill in:

- **Bot token** — starts with `xoxb-`
- **App token** — starts with `xapp-`
- **Channel** — the channel where you invited the bot (e.g. `#ai-tasks`)

The `channel` value must match the channel where you invited the bot.

## Step 8 — Restart Parallax

```bash
parallax stop
parallax start
```

Parallax reads the config at startup. You must restart for Slack changes to take effect.

## Step 9 — Verify it works

Create or trigger a task that Parallax will pick up. When the plan finishes generating you should see a message appear in your configured channel with Approve and Reject buttons.

If no message appears, check:

- The bot is invited to the correct channel.
- Both tokens are correct (bot token starts with `xoxb-`, app token with `xapp-`).
- The `channel` value matches exactly (including the `#`).
- `parallax status` shows the orchestrator is running.

## Security: keeping tokens safe

Bot and app tokens are sensitive credentials. Parallax stores them in `~/.parallax/config.json`, which is outside any repository by default. The tokens are never returned by the API and are masked in the dashboard UI.
