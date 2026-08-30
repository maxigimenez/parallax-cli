# Getting started

End to end: deploy the control plane, create an org and keys, install the runner on
the Mac Mini, and fire your first agent from a ticket label.

Three things are involved:

| Piece | Where it runs | What it does |
|---|---|---|
| `@parallax/cloud` | Railway | Stores config, the agent registry, and run history. Sends Slack notifications. |
| `parallax` runner | The Mac Mini, next to Hermes | Watches tickets/PRs, decides which agent to start, starts it, records what happened. |
| Hermes | The Mac Mini | Runs the agents. Owns git, worktrees, credentials, and pull requests. |

The runner never executes an agent itself and never touches a repository. It decides
*when*, *which agent*, and *with what context* — Hermes does the work.

---

## 1. Prepare Hermes

On the Mac Mini, with Hermes already installed.

**Enable the API server.** In `~/.hermes/.env`:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=<a long random string>
API_SERVER_PORT=8642
```

**Serve every profile from one gateway:**

```bash
hermes config set gateway.multiplex_profiles true
```

**Give every profile its own key.** This is not optional. Under
`multiplex_profiles`, the default profile's key is *rejected* on `/p/<profile>/…`
routes, so a shared key fails closed. For each profile, in
`~/.hermes/profiles/<name>/.env`:

```bash
API_SERVER_KEY=<a different long random string>
```

**Restart and verify:**

```bash
hermes gateway restart
hermes profile list

# The default profile (unprefixed):
curl -H "Authorization: Bearer $DEFAULT_KEY" http://127.0.0.1:8642/v1/capabilities

# A named profile (prefixed, its own key):
curl -H "Authorization: Bearer $PRODUCT_KEY" \
     http://127.0.0.1:8642/p/product/v1/capabilities
```

Both must return JSON with `"platform": "hermes-agent"`. If the second returns 401,
that profile's `.env` key is missing or the gateway was not restarted.

**Make sure each profile can reach the repo it should work on.** Because agents do
their own git and open their own PRs, a profile needs a working directory and its own
git/GitHub credentials. Check with:

```bash
curl -XPOST -H "Authorization: Bearer $PRODUCT_KEY" \
     -H 'content-type: application/json' \
     -d '{"input":"run: pwd && git remote -v && gh auth status"}' \
     http://127.0.0.1:8642/p/product/v1/runs
```

Set a profile's working directory with `hermes config set terminal.cwd /path/to/repo`
under that profile, or use `hermes project` for multi-folder workspaces. This is only
needed for routes whose agents write code; analysis and review routes do not need it.

---

## 2. Deploy the control plane

See [deploy-cloud.md](./deploy-cloud.md). In short: point Railway at this repo (the
root `Dockerfile` is auto-detected), attach your Postgres, deploy.

---

## 3. Create your organization and keys

Run once, inside the deployed container:

```bash
railway ssh --service api        # your service name
# then:
node dist/org-cli.js --name "Your Company"
```

It prints two keys, once:

```
  user key:   prx_usr_…      the management API (routes, projects, Slack)
  runner key: prx_rnr_…      goes on the Mac Mini
```

Neither is recoverable. Store them now.

---

## 4. Configure what should happen

Using the **user key**, against your Railway URL. Full reference in [api.md](./api.md).

Register the project the runner should watch:

```bash
curl -X POST "$CLOUD/v1/projects" \
  -H "Authorization: Bearer $USER_KEY" -H 'content-type: application/json' \
  -d '{
    "id": "taplands",
    "provider": "linear",
    "filters": { "team": "ENG" }
  }'
```

Create a route — *when this happens, start that agent*:

```bash
curl -X POST "$CLOUD/v1/routes" \
  -H "Authorization: Bearer $USER_KEY" -H 'content-type: application/json' \
  -d '{
    "name": "Product review on feasibility label",
    "priority": 100,
    "enabled": true,
    "trigger": { "type": "ticket", "provider": "linear", "projectId": "taplands" },
    "match":   { "labels": { "any": ["feasibility"] } },
    "target":  { "agentRef": { "profile": "product" } },
    "execution": {
      "promptTemplate": "product-review",
      "requireApproval": false,
      "timeoutSeconds": 1800
    },
    "outcome": {
      "postComment": { "target": "ticket" },
      "labels": { "add": ["reviewed"], "remove": ["feasibility"] }
    }
  }'
```

Optionally, get visibility in Slack — create an
[incoming webhook](https://api.slack.com/messaging/webhooks), then:

```bash
curl -X PUT "$CLOUD/v1/integrations/slack" \
  -H "Authorization: Bearer $USER_KEY" -H 'content-type: application/json' \
  -d '{ "webhookUrl": "https://hooks.slack.com/services/..." }'
```

---

## 5. Install the runner on the Mac Mini

This rewrite is not published to npm yet, so install from a checkout on the Mac Mini:

```bash
git clone <this repo> && cd parallax-cli
pnpm install
pnpm build
npm install -g ./packages/cli    # or: pnpm --filter parallax-cli pack:tarball

parallax init
```

Once it is published, `npm install -g parallax-cli` is all you need.

`init` asks for your cloud URL, the **runner** key, the Hermes base URL, and each
profile's `API_SERVER_KEY`. It probes every profile as you enter it, so a wrong key
fails there rather than silently an hour later.

```bash
parallax preflight     # Node, Hermes profiles, cloud, gh auth
parallax start
parallax status
```

Then make it survive reboots:

```bash
parallax runner install    # launchd agent: RunAtLoad + KeepAlive
parallax runner status
```

---

## 6. Check it works

```bash
parallax agents     # every Hermes profile it discovered, with model and toolsets
parallax routes     # what it will act on
```

Send one prompt straight to Hermes, bypassing all routing — the fastest way to tell
whether the machine can drive an agent at all:

```bash
parallax run --agent product --prompt "Reply with the word ready."
```

Then the real thing: add the `feasibility` label to a Linear ticket. Within one poll
cycle:

```bash
parallax runs              # a run appears
parallax logs --follow     # tool calls and output stream in
```

A comment lands on the ticket, the labels swap, and Slack announces it.

---

## Everyday commands

```bash
parallax status                     is it up, and what does it see
parallax runs --status failed       what went wrong
parallax logs --run <id>            one run in full
parallax cancel <id>                stop it here and on Hermes
parallax runner status              launchd state
```

## When something is wrong

**An agent is missing from `parallax agents`.** Its key is wrong or the profile is
unreachable. `parallax preflight` names it and shows the error.

**Runs are queued but never start.** Hermes allows only one run per profile at a
time — concurrent runs corrupt a profile's memory — so a route targeting a busy agent
defers until it is free. `parallax runs` shows what is occupying it.

**Routes list is empty after a cloud outage.** The runner caches the last known good
set in `~/.parallax/routes.json` and keeps dispatching from it. If that file has never
been written, there is nothing to fall back to.

**`parallax logs` shows nothing for a long run.** Hermes expires run event buffers
after five minutes, so progress output can stop while the run continues. Status comes
from polling, not the stream, so `parallax runs` stays accurate.
