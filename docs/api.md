# Cloud API reference

Base URL is your Railway deployment. Every endpoint below except `/health` needs a
bearer token.

## Authentication

Two key scopes, and they are not interchangeable — a runner key presented to a
management endpoint is rejected, and vice versa. That separation is the only thing
standing between an unattended daemon's credential and a human's.

| Scope | Prefix | Used by | Reaches |
|---|---|---|---|
| `user` | `prx_usr_` | You, and later the dashboard | `/v1/*` management endpoints |
| `runner` | `prx_rnr_` | The runner on the Mac Mini | `/v1/runner/*` only |

```
Authorization: Bearer prx_usr_…
```

Keys are stored as SHA-256 hashes. The plaintext is shown once, at creation, and is
not recoverable.

---

## Bootstrap

The first key cannot come from the API, because minting keys requires one. It comes
from a one-off command run against the deployment:

Run it inside the deployed container, where `DATABASE_URL` resolves:

```bash
railway ssh --service api        # your service name
# then, in the container:
node dist/org-cli.js --name "Your Company"
node dist/org-cli.js --list
node dist/org-cli.js --org org_abc123 --add-key runner
```

Or from a local checkout, against the database's **public** URL — Railway's
`DATABASE_URL` points at an internal host that only resolves inside the platform:

```bash
pnpm --filter @parallax/common build && pnpm --filter @parallax/cloud-api build
cd packages/cloud
DATABASE_URL="$(railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  node dist/org-cli.js --name "Your Company"
```

After that, manage keys through the API.

---

## Health

```http
GET /health
```

Unauthenticated, because Railway's health check runs before any key exists.

```json
{ "status": "ok", "version": "0.2.0" }
```

---

## Keys

```http
GET    /v1/keys
POST   /v1/keys        { "name": "ci", "scope": "runner" | "user" }
DELETE /v1/keys/:id    revokes; the row stays for the audit trail
```

`POST` responds with the plaintext key. It is never shown again.

```json
{ "id": "key_…", "key": "prx_rnr_…", "scope": "runner", "prefix": "prx_rnr_a1b2c3d4" }
```

---

## Projects

What the runner should watch. A project is a ticket source, nothing more — there is no
local clone and no agent attached to it.

Projects live here, not in the runner's local config: `parallax init` never writes
them. A runner with no projects polls nothing, so nothing can ever trigger.

```http
GET    /v1/projects
POST   /v1/projects
DELETE /v1/projects/:id
```

```jsonc
// Linear
{ "id": "taplands", "provider": "linear", "filters": { "team": "ENG" } }

// GitHub
{ "id": "www", "provider": "github",
  "filters": { "owner": "acme", "repo": "www", "state": "open" } }
```

`filters` is a coarse pre-filter applied **at the source**, before routing sees
anything. A route can only ever match a ticket a filter let through, which makes an
over-narrow filter the most common reason a correct-looking route never fires. If a
route matches on `labels`, leave `filters.labels` unset and let the route decide.

---

## Routes

The core abstraction: **when this happens, start that agent, then do this with the
result.**

Every supported case, with a ready-made route for each, is in
**[routes.md](./routes.md)**. What follows is the wire format.

```http
GET    /v1/routes
POST   /v1/routes        create, or update by passing an existing id
DELETE /v1/routes/:id
```

```jsonc
{
  "id": "rt_product_review",        // omit to have one generated
  "name": "Product review on feasibility label",
  "priority": 100,                  // highest wins; ties break on id
  "enabled": true,

  "guard": {
    "refire": "once",               // once | per-change
    "markers": true                 // apply parallax:* labels around the run
  },

  "trigger": {
    "type": "ticket",               // ticket | pr_event | pr_review_requested | manual
    "provider": "linear",           // optional; omit to match either provider
    "projectId": "taplands"
  },

  "match": {                        // every clause must hold
    "labels": { "any": ["feasibility"], "none": ["blocked"] },
    "state":  { "any": ["Backlog"] },
    "assignees": { "any": ["acme-bot"] },
    "titleMatches": "^RFC:",        // regex against the title
    "bodyMatches": "billing",       // regex against the description

    // pull requests only
    "isDraft": false,
    "baseBranch": { "any": ["main"] },

    // transitions — what changed since the last poll
    "labelsAdded":    { "any": ["needs-review"] },
    "labelsRemoved":  { "any": ["blocked"] },
    "assigneesAdded": { "any": ["acme-bot"] },
    "reviewersAdded": { "any": ["acme-reviewer"] }
  },

  "target": {
    "agentRef": { "profile": "product" }
    // or, for pr_review_requested:
    // "agentRef": { "githubLogin": "acme-reviewer-bot" }
  },

  "execution": {
    "prompt": "Review {{ticket.ref}}: {{ticket.title}}\n\n{{ticket.body}}",
    "requireApproval": false,            // uses Hermes' own approval gate
    "modelOverride": null,               // null = the profile's own model
    "timeoutSeconds": 1800
  },

  "outcome": {
    "postComment": { "target": "ticket" },   // ticket | pr | none
    "labels": { "add": ["reviewed"], "remove": ["feasibility"] }
  }
}
```

### The prompt

`execution.prompt` is free text stored on the route — there are no built-in
templates to choose between. Rewording what an agent is asked to do is the main thing
you will want to tune, and that should never require a release.

Placeholders are `{{name}}`:

| | |
|---|---|
| `ticket.ref` `ticket.title` `ticket.body` | the ticket |
| `ticket.url` `ticket.state` `ticket.labels` | `labels` renders as a comma-separated list |
| `project.id` | the project that produced the trigger |
| `agent.profile` `agent.role` | the agent about to run |
| `pr.number` `pr.reviewers` | populated for pull-request triggers |

An unrecognized placeholder is **left in the text verbatim** and logged as a warning,
rather than blanked. A typo like `{{ticket.titel}}` silently becoming an empty string
produces a confidently wrong run; leaving it visible makes the mistake obvious in the
transcript.

Parallax appends its own closing instruction asking for a `PARALLAX_SUMMARY:` line —
that summary is what lands in the ticket comment and the Slack message. If your prompt
already mentions `PARALLAX_SUMMARY`, yours is used as written.

```http
GET /v1/route-templates      complete routes for every supported case
GET /v1/prompt-templates     starter prompts and the placeholder list
GET /v1/reserved-labels      the parallax:* labels and the default guard
```

These are what a dashboard builds its "new route" flow from. `route-templates` returns
whole routes carrying `<PLACEHOLDER>` tokens for a user to fill in — distinct from the
`{{variables}}` the runner substitutes at dispatch. Every template is verified in CI
against this API's own validator and the prompt renderer, so one that is picked and
filled always produces a route the API accepts.

Nothing dispatches by template id: changing a catalog never alters an existing route.

### Pull request routes

`pr_event` fires for **every open pull request**, every cycle. Use it for anything
keyed on labels, assignees, draft state or base branch.

`pr_review_requested` fires only when someone is awaiting review, and is the one to
use with `target.agentRef.githubLogin` — it matches the agent that was actually
requested, not merely any agent.

A pull request produces both events when it has a requested reviewer, so a route must
pick the trigger type it means.

```jsonc
// "When acme-bot is assigned a PR, have the reviewer agent look at it."
{
  "name": "Review PRs assigned to the bot",
  "trigger": { "type": "pr_event", "provider": "github", "projectId": "www" },
  "match":   { "assignees": { "any": ["acme-bot"] }, "isDraft": false },
  "target":  { "agentRef": { "profile": "reviewer" } },
  "execution": { "prompt": "Review PR #{{pr.number}}: {{ticket.title}}\n\n{{ticket.body}}",
                 "requireApproval": false, "timeoutSeconds": 900 }
}
```

```jsonc
// "When needs-review is ADDED to a PR" — fires on the transition, not on
// every subsequent poll while the label happens to be there.
{
  "name": "Review on label",
  "trigger": { "type": "pr_event", "provider": "github", "projectId": "www" },
  "match":   { "labelsAdded": { "any": ["needs-review"] } },
  "target":  { "agentRef": { "profile": "reviewer" } },
  "execution": { "prompt": "Review PR #{{pr.number}}.", "requireApproval": false,
                 "timeoutSeconds": 900 }
}
```

### A review cycle

Request review → the agent reviews → you reply and re-request → the agent reviews
again. Match on `reviewersAdded`, which fires on the *act* of requesting, not while a
request is outstanding:

```jsonc
{
  "name": "Reviewer agent",
  "guard":   { "refire": "per-change", "markers": true },
  "trigger": { "type": "pr_review_requested", "provider": "github", "projectId": "www" },
  "match":   { "reviewersAdded": { "any": ["acme-reviewer"] } },
  "target":  { "agentRef": { "githubLogin": "acme-reviewer" } },
  "execution": {
    "prompt": "You have been requested as a reviewer on {{ticket.ref}}.\n\nRead it yourself:\n  gh pr view {{pr.number}} --repo {{repo.slug}} --json title,body,comments,reviews\n  gh pr diff {{pr.number}} --repo {{repo.slug}}\n\nIf you reviewed this before, your earlier comments are in that thread. Read the\nauthor's replies and pick up from there rather than repeating findings that have\nalready been addressed.\n\nLeave your review with `gh pr review`.",
    "requireApproval": false,
    "timeoutSeconds": 1800
  }
}
```

`refire: "per-change"` is required — the default `once` would fire one round and stop.
That is safe here because `reviewersAdded` only matches when a reviewer is newly
requested: the agent posting comments, or you pushing commits, adds no reviewer and so
cannot re-summon it.

**Parallax does not fetch the diff or the conversation.** The agent has `gh` and gets
them itself, which is why the prompt tells it to. Inlining that context would put
Parallax back in the business of fetching things the agent can already reach — the same
boundary that keeps git, worktrees and pull requests on the Hermes side.

`{{repo.slug}}` renders as `owner/repo`, so those commands are copy-pasteable.

### Transitions vs. state

`labels` asks *does it have this label now*. `labelsAdded` asks *was it just added*.

Transition clauses need a previous observation, so they **never match the first time
an item is seen**. That is deliberate: without it, creating a route would fire it
across every pull request that already carries the label. A new route starts quiet and
acts on what happens next.

`labelsRemoved` and `assigneesAdded` work the same way.

### Not running twice: the loop guard

An agent acting on a pull request *changes* it — a commit, a review, a comment. If a
route re-fired on every change, it would retrigger itself on its own work. Two
independent mechanisms prevent that.

**`guard.refire`** — `once` (the default) means a route fires for an item exactly
once, whatever happens to it afterwards; the item's revision is excluded from the
dedupe key entirely. `per-change` restores fire-on-every-change and is only safe with
markers on, which the API enforces.

**`guard.markers`** — Parallax writes reserved labels around the run:

| Label | Meaning |
|---|---|
| `parallax:in-progress` | a run is working on this right now |
| `parallax:done` | a run completed |
| `parallax:failed` | a run failed |

Everything Parallax writes is prefixed `parallax:`, so machine-managed labels are
obvious in the tracker. They are created automatically if the repo or team does not
have them.

**No route ever matches an item carrying `parallax:in-progress`** — unconditionally,
even for a route that turned markers off. Starting a second agent on something already
being worked on is never what you want.

A `once` route also declines anything carrying `parallax:done` or `parallax:failed`.
**Removing that label by hand is how you re-arm a route** — which is also how you retry
something that failed.

`GET /v1/reserved-labels` returns the list and the default guard.

### Match semantics

- `any` — at least one present (OR)
- `all` — every one present (AND)
- `none` — not one present (NOR)

Omitted keys impose no constraint. An explicitly empty array also imposes none, so a
half-filled rule never accidentally matches everything. An unparseable regex fails
closed: that route matches nothing rather than everything.

### What routes deliberately cannot do

There is no `workspace` field and no `openPullRequest` outcome. Branches, commits, and
pull requests belong to the agent, which does them under its own identity. Outcomes
cover only what Parallax owns: the summary comment — which must land even when the run
*failed*, so it cannot be delegated to the thing that failed — and tracker labels.

### Firing once

Every dispatch is keyed on `(route, trigger ref, trigger revision)`. `revision` is the
ticket's `updatedAt`, so re-observing an unchanged ticket on the next poll does
nothing, while a genuine edit — a new label, a state change — fires the route again.

For `pr_review_requested`, the requested-reviewer set is folded into the revision, so
adding an agent as a reviewer re-fires even when nothing else about the PR changed.

---

## Runs

```http
GET  /v1/runs?status=failed&limit=50
GET  /v1/runs/:id
GET  /v1/runs/:id/events?since=<ms>&limit=500
POST /v1/runs                { "event": { … } }   queue a manual dispatch
POST /v1/runs/:id/cancel
POST /v1/resync                                   make the runner reload config
```

`POST` endpoints return `202` with a command id. They queue work for the runner, which
picks it up on its next long poll — usually within a second or two, not on a fixed
interval.

Statuses: `queued`, `running`, `awaiting_approval`, `completed`, `failed`, `canceled`.
`awaiting_approval` still occupies its agent.

---

## Agents and runners

```http
GET /v1/agents      Hermes profiles, as discovered by the runner (incl. avatar_url)
GET /v1/runners     registered runners, with a `stale` flag after 90s of silence
```

Agents are derived state, republished wholesale on every inventory push — a profile
deleted in Hermes disappears here rather than lingering. They are read-only through the
API; the source of truth is Hermes itself.

---

## Slack

```http
GET    /v1/integrations/slack
PUT    /v1/integrations/slack   { "webhookUrl": "https://hooks.slack.com/services/…" }
DELETE /v1/integrations/slack
```

`GET` reports *that* a webhook is configured, never what it is.

Events: `run.started`, `run.completed`, `run.failed`, `run.needs_approval`,
`run.canceled`, `runner.stale`. Restrict them by passing `events` to `PUT`.

An agent with an `avatarUrl` has its image rendered **inside** the message, as a Block
Kit accessory. The Slack app's own name and icon are never overridden — the webhook's
identity belongs to the app, not to whichever agent happens to be running.

Notifications are sent cloud-side rather than by the runner for one reason worth
knowing: only the cloud can report `runner.stale` when the Mac Mini drops off the
network. Delivery is deduplicated on `(run, event)`, so a retry can never double-post.

---

## Runner endpoints

Documented for completeness. The runner calls these; you should not need to.

```http
POST  /v1/runner/hello                    register and heartbeat
PUT   /v1/runner/inventory                publish discovered agents
GET   /v1/runner/projects                 pull ticket sources to watch
GET   /v1/runner/routes                   pull enabled routes
GET   /v1/runner/commands?cursor=&wait=   long poll, up to 30s
POST  /v1/runner/commands/ack
POST  /v1/runner/runs                     mirror a new run
PATCH /v1/runner/runs/:id                 mirror a status change
POST  /v1/runner/runs/:id/events          mirror log events
```

`GET /v1/runner/commands` is held open until something arrives or the window closes.
An empty array is the normal, healthy result — not an error. This is how a runner
behind NAT receives work without any inbound connection.

---

## Errors

```json
{ "error": "execution.prompt is required." }
```

| Status | Means |
|---|---|
| 400 | Malformed body; the message names the field |
| 401 | Missing, revoked, or wrong-scope key |
| 404 | Not found in your organization |
| 409 | Out of order — e.g. inventory pushed before `hello` |
