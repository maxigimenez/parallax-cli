# Deploying the control plane to Railway

`packages/cloud` is a Fastify service over Postgres. It ships as a Docker image built
from the repo root, because this is a pnpm workspace and `@parallax/common` is a
workspace dependency.

The `Dockerfile` lives at the **repo root** rather than beside the package it builds.
That is deliberate: Railway auto-detects `./Dockerfile` and uses the Docker builder
with no configuration at all. A Dockerfile tucked under `packages/cloud` only works if
Railway actually reads `railway.json`, and when it does not — a service with its own
build settings, or a root-directory override — it silently falls back to its default
builder and fails with *"No start command detected"*.

## What you need

- A Railway project with a Postgres database (you have this)
- The Railway CLI: `npm i -g @railway/cli`, then `railway login`

## The two database URLs

Railway's Postgres exposes two connection strings, and picking the wrong one is the
most common way to lose an afternoon here:

| Variable | Host | Reachable from |
|---|---|---|
| `DATABASE_URL` | `postgres.railway.internal` | **Only inside Railway.** This is what the deployed service uses. |
| `DATABASE_PUBLIC_URL` | `*.proxy.rlwy.net:<port>` | Anywhere, including your laptop. |

So: the service gets `DATABASE_URL`; anything you run locally against that same
database uses `DATABASE_PUBLIC_URL`.

## 0. Work against the Railway database from your laptop

Useful before you deploy anything — it applies the schema and creates your keys, so
the service has something to serve the moment it comes up.

**Link at the repo root, and stay there.** The Railway CLI scopes a link to the
directory you ran it in, and deploys must happen from the root anyway (that is the
Docker build context). Linking inside `packages/cloud` leaves the root unlinked, and
`railway add` there fails with *"No linked project found"*.

```bash
cd /path/to/parallax-cli        # repo root — do everything from here

pnpm install
pnpm --filter @parallax/common build
pnpm --filter @parallax/cloud build

railway link                    # once, at the root; pick your project
```

Point at the database over its public URL and apply the schema. Both scripts resolve
their own paths, so running them from the root is fine:

```bash
export DATABASE_URL="$(railway variables --service Postgres --kv \
  | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)"

node packages/cloud/dist/migrate-cli.js                    # apply the schema
node packages/cloud/dist/org-cli.js --name "Your Company"  # your two keys, once
```

You can also run the whole service locally against that database:

```bash
PORT=8080 node packages/cloud/dist/index.js
curl http://127.0.0.1:8080/health
```

TLS is on by default with verification relaxed, which is what the Railway proxy needs.
Only set `DATABASE_SSL=disable` for a plain local Postgres.

If `railway variables` prints nothing, your Postgres service is named something other
than `Postgres`. List services with `railway status`, or copy `DATABASE_PUBLIC_URL`
out of the dashboard and `export DATABASE_URL=...` by hand.

## 1. Create the service

`railway up` deploys straight from your working directory — no git remote required,
which is convenient while this still lives on a branch:

If you already created a service in the dashboard, skip this — `railway add` would
make a second one.

```bash
# Still at the repo root, still linked from step 0.
railway add --service api
```

Every `--service` below must match your service's real name. `railway status` lists
them.

`railway.json` at the repo root already declares everything:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "preDeployCommand": "node dist/migrate-cli.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### If Railway ignores `railway.json`

It is read from the service's root directory, so a service with a **Root Directory**
set to anything other than the repo root will not see it — and you get *"No start
command detected"* from Railpack instead of a Docker build.

With the Dockerfile at the repo root this mostly cannot happen, but if it does, set it
explicitly in the dashboard under **Settings → Build**:

- Builder: `Dockerfile`
- Dockerfile Path: `Dockerfile`
- Root Directory: empty

and under **Settings → Deploy**:

- Pre-deploy Command: `node dist/migrate-cli.js`
- Health Check Path: `/health`

The image sets `WORKDIR /app/packages/cloud`, so both commands are relative to that.

## 2. Attach Postgres

In the service's Variables tab, reference the database:

```
DATABASE_URL = ${{Postgres.DATABASE_URL}}
```

That is the only required variable. Optional ones:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | injected by Railway | Listen port |
| `CORS_ORIGINS` | all | Comma-separated allowlist, for when the dashboard exists |
| `LOG_LEVEL` | `info` | Fastify log level |
| `DATABASE_POOL_MAX` | `10` | Pool size |
| `DATABASE_SSL` | TLS on | Set to `disable` only for a local Postgres |

Railway's managed Postgres presents a certificate the default Node agent will not
verify, so the connection is TLS with verification off. `DATABASE_SSL=disable` turns
TLS off entirely and is only appropriate locally.

## 3. Deploy

```bash
railway up --service api
railway domain --service api        # generate a public URL
```

The pre-deploy command applies migrations before the new container takes traffic, so a
deploy is ordered and repeatable. Migrations are plain `.sql` files in
`packages/cloud/src/migrations`, applied once each in filename order, one transaction
per file. Running them from your laptop first (step 0) is harmless — they are recorded
in `schema_migrations` and skipped on the next run.

Watch it come up with `railway logs --service api`.

Confirm:

```bash
curl https://<your-service>.up.railway.app/health
# {"status":"ok","version":"0.2.0"}
```

`/health` is unauthenticated on purpose: the health check has to pass before any key
exists.

## 4. Create your organization

**Skip this if you did step 0** — the org and both keys already exist. Creating a
second org would give you a second, unrelated set of keys.

If you deployed first and want to bootstrap from inside the container:

```bash
railway ssh --service api
# then, in the container:
node dist/org-cli.js --name "Your Company"
```

Prints a user key and a runner key, once. Check what already exists with
`node dist/org-cli.js --list`.

## Reading a failed build

Railway truncates build output in the deploy summary. The real error — an exit code,
an OOM kill — is in the full log:

```bash
railway logs --service api --build
```

The image is built in three stages: a `prod-deps` stage that resolves runtime
dependencies, a `build` stage that compiles TypeScript, and a slim runtime that copies
`dist` plus the production `node_modules`. Each install runs once on a clean tree.
An earlier version installed everything, built, then re-ran `pnpm install --prod` over
the top; that pass has to tear down and rebuild `node_modules`, and it was the step
that failed on Railway while succeeding locally.

To reproduce a Railway build exactly, match its architecture:

```bash
docker build --platform linux/amd64 -t parallax-cloud .
```

## Adding a migration

Add `packages/cloud/src/migrations/002_whatever.sql`. Nothing else — the migrator
picks up any `.sql` file it has not already applied and records it in
`schema_migrations`.

Migrations only run forward. There is no down path, so write additive changes: a
deploy that fails mid-rollout should leave the old container able to serve.

## Notes

- **The runner never accepts inbound connections.** It long-polls
  `/v1/runner/commands`, so the Mac Mini works behind NAT with no tunnel and no port
  forwarding. Nothing needs to reach it.
- **The service is stateless.** All state is in Postgres; scaling to more than one
  instance is safe, though at one runner per org there is no reason to.
- **Long polls hold a connection for up to 30 seconds.** That is one held connection
  per runner, which is why `DATABASE_POOL_MAX` does not need raising for the poll
  itself — the poll sleeps between cheap queries rather than holding a transaction.
