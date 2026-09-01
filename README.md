# Parallax

Trigger your [Hermes](https://hermes-agent.nousresearch.com) agents from your tickets
and pull requests.

You already run a fleet of Hermes profiles — a product reviewer, a code reviewer, an
implementer, each with its own memory, model, and GitHub account. Parallax is the layer
that decides **which one should start, when, and with what context**, then records what
happened and tells your team about it.

```jsonc
// "When a Linear ticket gets the feasibility label,
//  have the product agent assess it and comment back."
{
  "name": "Product review on feasibility label",
  "trigger": { "type": "ticket", "provider": "linear", "projectId": "taplands" },
  "match":   { "labels": { "any": ["feasibility"] } },
  "target":  { "agentRef": { "profile": "product" } },
  "execution": { "prompt": "Assess {{ticket.ref}}: {{ticket.title}}\n\n{{ticket.body}}",
                 "timeoutSeconds": 1800 },
  "outcome": {
    "postComment": { "target": "ticket" },
    "labels": { "add": ["reviewed"], "remove": ["feasibility"] }
  }
}
```

That is the whole idea. Routes are data, so a new workflow is a row, not a code change
— and the prompt lives on the route, so rewording what an agent is asked to do never
needs a release.

Ready-made routes for every supported case, including multi-round pull request review,
are in **[docs/routes.md](./docs/routes.md)** and served from `GET /v1/route-templates`.

## How it fits together

```
Mac Mini                                    Railway
┌──────────────────────────────┐      ┌──────────────────────┐
│ Hermes gateway               │      │ parallax cloud       │
│   :8642  /p/<profile>/v1/…   │      │   config · registry  │
│   owns git, PRs, identity    │      │   run history        │
│            ▲                 │      │   Slack              │
│            │ POST /v1/runs   │      │                      │
│ parallax runner              │─────►│                      │
│   triggers → routes →        │ long │                      │
│   dispatch → outcomes        │ poll └──────────────────────┘
└──────────────────────────────┘
```

**Parallax never runs an agent itself and never touches a repository.** It decides;
Hermes does the work. The runner needs no clone of your code — only API access to your
tracker and HTTP access to Hermes on the same machine.

The runner only makes outbound connections, so the Mac Mini works behind NAT with no
tunnel and no port forwarding.

## Getting started

Full walkthrough: **[docs/getting-started.md](./docs/getting-started.md)**

```bash
# On the Mac Mini, next to Hermes
npm install -g parallax-cli

parallax init          # cloud key, Hermes profiles — each key is probed as you enter it
parallax preflight     # Node, Hermes, cloud, gh auth
parallax start
parallax runner install  # survive reboots (launchd)
```

Then:

```bash
parallax agents               # profiles it discovered, with models and toolsets
parallax routes               # what it will act on
parallax runs                 # recent runs
parallax logs --follow        # watch one happen
parallax cancel <id>          # stop it here and on Hermes
```

Debugging a machine, not a workflow:

```bash
parallax run --agent product --prompt "Reply with the word ready."
```

## Documentation

| | |
|---|---|
| [Getting started](./docs/getting-started.md) | Hermes setup, deploy, keys, first route |
| [Routes](./docs/routes.md) | Every supported trigger, match, guard and outcome |
| [Cloud API](./docs/api.md) | Orgs, keys, projects, routes, runs, Slack |
| [Deploying to Railway](./docs/deploy-cloud.md) | Docker build, migrations, env vars |
| [CLAUDE.md](./CLAUDE.md) | Architecture, for contributors |

## Requirements

- **Hermes Agent** with its API server enabled and `gateway.multiplex_profiles` on,
  and a distinct `API_SERVER_KEY` per profile
- **Node.js >= 22.5** — the CLI re-executes itself under a compatible interpreter if
  the active one cannot load `node:sqlite`
- **Postgres**, for the control plane
- `gh`, authenticated, if any project pulls from GitHub

## Repository layout

```
packages/
  common/         shared types — run status, routing rules, config
  orchestrator/   the runner: triggers, routes, dispatch, outcomes
  cli/            the published parallax-cli package
  cloud/          Railway control plane (Fastify + Postgres)
```

```bash
pnpm install
pnpm build
pnpm test
```
