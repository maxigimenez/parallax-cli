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

Three shapes of route cover most of what you will want:

| You want | `trigger.type` | `match` |
|---|---|---|
| a ticket gets a label | `ticket` | `labels` or `labelsAdded` |
| a PR is assigned to someone | `pr_event` | `assignees` or `assigneesAdded` |
| an agent is asked to review a PR | `pr_review_requested` | target by `githubLogin` |

Routes fire **once per item** by default and mark their work with `parallax:` labels,
so an agent's own commits and comments cannot retrigger the route that started them.
See [api.md](./api.md#not-running-twice-the-loop-guard).


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
      "prompt": "Assess {{ticket.ref}} for feasibility.\n\nTitle: {{ticket.title}}\n\n{{ticket.body}}\n\nDo not write code.",
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
npm install -g ./packages/cli

parallax init
```

Once it is published, `npm install -g parallax-cli` is all you need.

A global install from a local path symlinks `parallax` straight at the compiled
entry point, so that file must be executable. `pnpm build` sets the bit; if you ever
see `zsh: permission denied: parallax`, the build did not run or ran from an older
checkout — rebuild, or `chmod +x $(readlink -f "$(which parallax)")`.

### Node versions

Parallax needs a Node that can load `node:sqlite` — 22.5 or newer (22.x needs
`--experimental-sqlite`, which Parallax passes for you).

You do not have to keep that version selected. If `parallax` is invoked under an
interpreter that cannot load it, it finds one that can — checking the interpreter it
last used, then nvm, fnm, volta, asdf and Homebrew — and re-executes itself there.
The choice is remembered in `~/.parallax/node-runtime.json`.

The runner is started with that absolute interpreter path rather than whatever `node`
means at the time, so a version switch months later cannot break a daemon that is
already installed. `parallax runner status` warns if that interpreter has since been
removed; `parallax runner install` repins it.

If no usable Node exists at all, you get a message saying so rather than a failure
deep inside the database layer.

`init` asks for your cloud URL and the **runner** key, then reads your Hermes install
directly: it lists every profile under `~/.hermes/profiles/`, picks each one's
`API_SERVER_KEY` out of its own `.env`, and asks you which to add. It probes each as it
goes, so a wrong key fails there rather than silently an hour later. Optional per
profile: a role, a GitHub login (for PR-review routes), and an avatar image URL (shown
in Slack).

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
parallax projects   # ticket sources it is polling — zero here means nothing can fire
parallax agents     # every Hermes profile it discovered, with model and toolsets
parallax routes     # what it will act on
```

Projects and routes are re-read from the cloud every poll cycle, so adding either in
the dashboard takes effect within about 25 seconds with no restart. `parallax reload`
forces it immediately; `parallax restart` is only for changes to
`~/.parallax/config.json` or a new build.

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

**A route fired once and never again.** That is the default. `guard.refire` is `once`,
and the item now carries `parallax:done`. Remove that label to re-arm it, or set
`"guard": { "refire": "per-change", "markers": true }` on the route.

**A "label added" route never fires.** Transition matching needs a previous
observation, so it never matches the first time Parallax sees an item. Add and remove
the label once while the runner is up, and it will fire on the next add.

**A labelled ticket produced no run.** Watch one poll cycle in the log — the runner
prints a summary line every cycle:

```
poll: 12 event(s) (taplands 12) · dispatched 1 · skipped 11 (no-route 10, duplicate 1)
```

`0 event(s)` means the runner never fetched the ticket: either no projects
(`parallax projects`) or the project's `filters` excluded it. `no-route` means it was
fetched but no rule matched. `unknown-agent` means the route names a profile that is
not in `parallax agents`.

**Runs are queued but never start.** Hermes allows only one run per profile at a
time — concurrent runs corrupt a profile's memory — so a route targeting a busy agent
defers until it is free. `parallax runs` shows what is occupying it.

**Routes list is empty after a cloud outage.** The runner caches the last known good
set in `~/.parallax/routes.json` and keeps dispatching from it. If that file has never
been written, there is nothing to fall back to.

**`parallax logs` shows nothing for a long run.** Hermes expires run event buffers
after five minutes, so progress output can stop while the run continues. Status comes
from polling, not the stream, so `parallax runs` stays accurate.
