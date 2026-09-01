# CI and releasing

Three workflows. One runs on every change; two ship things.

| Workflow | Trigger | What it does |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | PRs, pushes to `main` | Lint, typecheck, test on Node 22 and 24, build the cloud-api image |
| [`deploy-cloud-api.yml`](../.github/workflows/deploy-cloud-api.yml) | Manual, or `main` touching `cloud-api` | Deploys to Railway and waits for `/health` |
| [`publish-cli.yml`](../.github/workflows/publish-cli.yml) | Manual, or a published GitHub release | Verifies, packs, and publishes `parallax-cli` to npm |

---

## CI

Runs the whole suite on **Node 22.11 and Node 24**. That matrix is not decoration: 22
needs `--experimental-sqlite` for `node:sqlite` and 24 ignores it, so running both is
what keeps the supported range honest rather than aspirational. `NODE_OPTIONS` carries
the flag for the whole job.

It builds **before** typechecking and testing, and the order matters twice over.
`cloud-api` resolves `@parallax/common` through its built `.d.ts` rather than a path
alias, so a typecheck against a clean tree cannot see it at all. And one suite imports
the built package rather than the source — every other test aliases
`@parallax/common` to `src/`, which resolves module cycles differently from the real
ESM graph. A circular import once passed the entire suite and only failed when the
container started.

A third job parses every workflow file. An invalid one produces a GitHub run with no
jobs and an error that appears in no job log, which is a genuinely confusing way to
discover a stray `:` in a `run:` line.

A second job builds the Docker image for `linux/amd64`, the architecture Railway
deploys on, and checks that both CLI entry points inside the image resolve. An image
that builds here is one that builds there.

---

## Deploying cloud-api

### One-time setup

1. In Railway: **Project Settings → Tokens → New Token**. A *project* token is enough
   and does not need linking.
2. In GitHub: **Settings → Secrets and variables → Actions**, add `RAILWAY_TOKEN`.
3. Optionally add a repository *variable* `CLOUD_HEALTH_URL` (e.g.
   `https://api-production-xxxx.up.railway.app`). The workflow otherwise scrapes the
   domain from the Railway CLI, whose output has changed shape between versions.

### Deploying

There are two ways in.

**Manually**, from the Actions tab — *Deploy cloud-api → Run workflow*. GitHub's
**"Use workflow from"** dropdown picks the branch, and the deploy uses that checkout,
so you can ship a branch before it merges. The service name defaults to `api`.

> **The Run workflow button only appears once the workflow is on your default branch.**
> GitHub reads `workflow_dispatch` from `main` regardless of which branch you want to
> run. Until this merges, deploy by hand with `railway up --service api` from the repo
> root.

**Automatically**, on a push to `main` that touches `packages/cloud-api/**`,
`packages/common/**`, `Dockerfile` or `railway.json`. Path-filtered rather than every
merge, because redeploying the control plane interrupts a runner's long poll for no
reason. Delete the `push:` block if you would rather every deploy be deliberate.

The workflow deploys straight from the checkout, so no git remote needs connecting on
the Railway side, and the repo root is the Docker build context.

Deploys are serialized (`concurrency` without cancellation) because the pre-deploy step
runs migrations, and two concurrent migration runs against one database is a way to
lose an afternoon.

### After a deploy

The runner reloads projects and routes on its own each cycle, so nothing needs
restarting on the Mac Mini — *unless* the deploy added an endpoint the runner needs,
in which case the runner has to be updated too. Its fallback is deliberately quiet:

```bash
grep "Could not fetch" ~/.parallax/runner.stdout.log
```

---

## Publishing the CLI

### One-time setup

`parallax-cli` publishes with **npm trusted publishing** — no `NPM_TOKEN` in GitHub.
On npmjs.com, under the package's **Settings → Trusted Publisher**, set:

| Field | Value |
|---|---|
| Repository | `maxigimenez/parallax-cli` |
| Workflow | `publish-cli.yml` |
| Environment | `npm` |

> **If publishing suddenly fails with a permissions error**, check this first. The
> workflow was renamed from `release.yml` to `publish-cli.yml`, and trusted publishing
> matches on the workflow *filename*. A stale entry there rejects the publish with an
> error that does not mention the rename.

### Publishing

From the Actions tab — *Publish parallax-cli → Run workflow* — or by publishing a
GitHub release.

Inputs:

- **version** — optional. Runs `pnpm version:set`, which moves the root, every
  `packages/*`, and the internal `@parallax/*` dependency pins together. They must move
  in lockstep: those packages are unpublished and the CLI links them by version, so a
  stale pin falls through to the npm registry and fails to resolve on a user's machine.
- **dry_run** — packs, inspects and verifies without publishing.

Before publishing it runs lint, the full test suite, and a build, then checks two
things that only fail on a user's machine:

- **the entry point is executable.** `tsc` emits `0644`, and a global install symlinks
  `parallax` straight at the compiled file, so without the exec bit the command fails
  with `permission denied`. `pnpm build` sets it; this asserts it.
- **the internal packages are in the tarball.** `@parallax/common` and
  `@parallax/orchestrator` are bundled rather than fetched from npm, so if
  `prepare-package.mjs` misses one the install succeeds and the command then fails at
  runtime.

### Doing it by hand

```bash
pnpm version:set 0.2.0
pnpm install && pnpm lint && pnpm test && pnpm build

cd packages/cli
pnpm pack:tarball                     # runs prepack, then restores workspace links
tar -tzf parallax-cli-*.tgz | head    # inspect before shipping

pnpm publish:package
```

`prepack` dereferences the pnpm symlinks into real directories so the internal packages
can be bundled; `postpack` restores them. If a pack is interrupted, re-run
`pnpm install` to put the workspace back.

To test a tarball without publishing:

```bash
mkdir /tmp/t && cd /tmp/t && npm init -y
npm install /path/to/parallax-cli-0.2.0.tgz
./node_modules/.bin/parallax --version
```

---

## Adding a package to the CLI bundle

If the CLI ever depends on another internal package, it must be added to **three**
places or `npm publish` fails with a 415, or installs and then breaks at runtime:

1. `dependencies` and `bundleDependencies` in `packages/cli/package.json`
2. `bundledPackages` in `packages/cli/scripts/prepare-package.mjs`
3. the tarball assertion in `publish-cli.yml`

---

## Secrets and variables

| Name | Kind | Used by | Required |
|---|---|---|---|
| `RAILWAY_TOKEN` | secret | deploy-cloud-api | yes |
| `CLOUD_HEALTH_URL` | variable | deploy-cloud-api | no |
| npm trusted publishing | npm-side config | publish-cli | yes |

Both shipping workflows declare a GitHub **environment** (`production`, `npm`), so you
can add required reviewers under **Settings → Environments** to gate either behind an
approval.
