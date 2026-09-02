# The dashboard

`packages/cloud-dashboard` is a React app over the cloud user API. It is where you
watch runs, create routes, and manage projects, keys and Slack — the same things
`GET /v1/*` exposes, without curl.

It is a **pure client**. It holds no server-side session, has no database of its own,
and every request it makes is one an operator could make by hand. Everything it can do
is something a `prx_usr_` key can do.

## Signing in

Sign-in is a user key, pasted once and kept in `localStorage`.

The key is verified against `GET /v1/me` *before* it is stored, so a bad key fails at
the login form with a message rather than being kept and failing on every screen after
it. A stored key is re-verified on each load, because it may have been revoked since
the last visit. Any `401` from any screen ends the session and returns to the login
form — the key is gone, and showing six copies of the same error would be both noisier
and wrong.

> **What this is, and what it is not.** `localStorage` means the key is readable by
> anything with script access to this origin, and it persists until you sign out.
> That is acceptable for v1 because the same key is already sitting in config files on
> operator machines, and the dashboard is not yet multi-user. It is not a substitute
> for real accounts. The upgrade is a server-side session behind an httpOnly cookie,
> and it belongs with the work that introduces users — not before it.

A runner key pasted here is rejected with a `401`, because the API refuses runner scope
on user routes. The login copy names that case, since pasting the wrong one of two
similar-looking keys is the likeliest mistake.

## The API URL

The dashboard reads its API URL **at runtime**, from `PARALLAX_API_URL`.

`server.mjs` generates `/env.js` per request, and the page loads it before the bundle:

```js
window.__PARALLAX__ = { apiUrl: 'https://api-production-xxxx.up.railway.app' }
```

A `VITE_` variable would have been inlined by the bundler, which would mean rebuilding
and redeploying the image every time the control plane moved. This way it is a Railway
variable and a restart.

`GET /health` on the dashboard reports whether one is set:

```json
{ "status": "ok", "apiConfigured": true }
```

It reports `apiConfigured: false` rather than failing, because a container that cannot
serve its own pages is the outage worth restarting for; a missing API URL is fixed by
editing a variable. The deploy workflow turns that into a warning, and the login screen
says so in place.

The API must allow the dashboard's origin. `CORS_ORIGINS` on the cloud-api service is
a comma-separated allowlist, and unset means all.

## Local development

```bash
pnpm install
PARALLAX_API_URL=http://127.0.0.1:8080 pnpm --filter @parallax/cloud-dashboard dev
```

Vite serves `/env.js` itself in dev, from the same variable, so dev and production
resolve the URL through one code path rather than two that can disagree.

To run the whole stack locally, with the control plane against a throwaway Postgres:

```bash
docker run -d --name parallax-pg -e POSTGRES_PASSWORD=parallax \
  -e POSTGRES_DB=parallax -p 55433:5432 postgres:16

export DATABASE_URL="postgres://postgres:parallax@127.0.0.1:55433/parallax"
export DATABASE_SSL=disable

pnpm --filter @parallax/cloud-api build
node packages/cloud-api/dist/migrate-cli.js
node packages/cloud-api/dist/org-cli.js --name "Your Company"   # prints both keys

PORT=8080 node packages/cloud-api/dist/index.js
```

Then sign in with the `prx_usr_` key it printed.

To exercise the production server rather than Vite's:

```bash
pnpm --filter @parallax/cloud-dashboard build
PORT=8081 PARALLAX_API_URL=http://127.0.0.1:8080 \
  node packages/cloud-dashboard/server.mjs
```

## Deploying

The dashboard is a **second Railway service**, alongside `api`.

### One-time setup

1. Create a service named `dashboard` in the same Railway project.
2. Apply the project configuration, which tells that service to build
   `Dockerfile.dashboard` rather than the control plane's:

   ```bash
   railway config plan     # preview; changes nothing
   railway config apply
   ```

   This step is load-bearing. A service with no configuration of its own falls back
   to Railway's own detection, and previously to a root `railway.json` — which is how
   a dashboard service ends up building and deploying the *API* image, starting
   cleanly, and passing its health check while serving the wrong thing.
3. Under **Variables**, set `PARALLAX_API_URL` to the API service's public URL.
4. Generate a domain for the service.
5. On the **api** service, add the dashboard's origin to `CORS_ORIGINS` if you have
   narrowed it from the default.

### Deploying

Actions → **Deploy dashboard** → *Run workflow*, which lets you pick the branch; or
automatically on a push to `main` touching `packages/cloud-dashboard/**`,
`Dockerfile.dashboard` or `.railway/railway.ts`.

By hand:

```bash
railway up --service dashboard
```

The image is built from `Dockerfile.dashboard` at the repo root, with the root as
build context because this is a pnpm workspace.

> **`railway up` deploys source; it does not reconcile configuration.** After changing
> `.railway/railway.ts`, run `railway config apply` — otherwise the service keeps
> building whatever it was last told to.

## Why a server at all

The runtime image is a static bundle plus one script and **no `node_modules`** —
`server.mjs` is deliberately dependency-free. It exists for three things a bucket
cannot do:

- **`/env.js`**, so the API URL is a variable rather than a rebuild.
- **SPA fallback.** A request matching no file serves `index.html`, so `/runs/run_1`
  survives a reload or a shared link.
- **`/health`**, for Railway's check.

It also gets the caching right in the one way that matters: hashed assets under
`/assets/` are immutable for a year, and `index.html` never is — cache that and a
deploy reaches nobody still holding the previous one.

## What it does not do

- **No agent management.** Agents are Hermes profiles discovered on the runner's
  machine, not records anyone creates here. The next inventory push would overwrite
  anything the dashboard wrote.
- **No members, roles or billing.** There is no users table. An organization is a row
  and a set of keys; anyone holding a `prx_usr_` key has the same access.
- **No renaming an organization.** Its name is set by `org-cli.js` at creation and
  there is no endpoint to change it.
- **No route editing.** Routes are created from a template and deleted. Changing one
  means deleting it and creating its replacement, which is also what the API offers.

## Design system

The UI is built on [`@16-bits-design/ui`](https://github.com/maxigimenez/16-bits-design),
which is the component library for this visual language — square geometry, 2px borders,
offset shadows, JetBrains Mono body and Silkscreen display type, on the `ember` theme.

Application code uses `--bits-*` semantic variables and never hardcodes a colour, so
the whole dashboard follows the theme. `src/styles.css` holds layout only: the shell,
the tables, and the states the library does not ship yet — alerts, empty states,
loading, segmented filters and code blocks. Those gaps are filed as issues on the
library, and each local implementation is a candidate to delete when its component
lands.

### The `.px-root` prefix, and why it is not decoration

The library styles bare elements — `.bits-theme a`, `.bits-theme h1`, `.bits-theme h2`,
`.bits-theme p`, `.bits-theme code` — at specificity **(0,1,1)**. An application class
on one of those elements is **(0,1,0)** and loses *silently*: no error, no warning, just
the library's defaults.

This is not hypothetical. Every breadcrumb and every idle sidebar link rendered
`--bits-primary` orange instead of muted grey, and every section heading rendered as
24px display type instead of an 11px label, for exactly this reason. It survived
review because the result looks deliberate — an all-orange nav reads as a styling
choice until you hold it next to the design.

So any rule whose class lands on an element the library styles is written
`.px-root .px-thing`, reaching (0,2,0) without `!important`. Rules targeting a `div`,
`span`, `table` or `pre` need no prefix and do not have one.

`test/specificity.test.ts` enforces it: it reads the library's stylesheet to learn
which elements are styled bare, scans the JSX for `px-` classes on those elements, and
fails if the matching rule is unscoped. Nothing in TypeScript, ESLint or the build can
catch this, so it is a test.

One layout note worth keeping, because it is easy to reintroduce: `ThemeProvider`
renders a real `div` between `#root` and the app. `.px-root` gives that element a
height, and `.px-shell` is anchored to `100dvh` rather than a percentage — a height
inherited through flex-grow is used but not *definite*, so percentage heights below it
fall back to auto and every column collapses to its content.
