# Builds @sentinel0/cloud-api.
#
# Lives at the repo root, not beside the package it builds, for two reasons: the
# build context must be the root (this is a pnpm workspace and @sentinel0/common
# is a workspace dependency), and Railway auto-detects ./Dockerfile, so no
# builder configuration is required for a deploy to work.
#
#   docker build -t sentinel0-cloud-api .

# ── base ───────────────────────────────────────────────────────────────────
# pnpm refuses to remove a node_modules directory without a TTY, and the
# builder has none.
FROM node:23-slim AS base
WORKDIR /app
ENV CI=true
RUN corepack enable

# Only the manifests, so dependency layers survive source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/common/package.json packages/common/
COPY packages/cloud-api/package.json packages/cloud-api/

# ── prod dependencies ──────────────────────────────────────────────────────
# Installed once, on a clean tree. The previous version installed everything,
# built, then re-ran install with --prod over the top; that second pass has to
# tear down and rebuild node_modules, which is the step that failed on Railway.
# Resolving the production set from scratch never removes anything.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @sentinel0/cloud-api...

# ── build ──────────────────────────────────────────────────────────────────
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @sentinel0/cloud-api...

COPY tsconfig.base.json ./
COPY packages/common packages/common
COPY packages/cloud-api packages/cloud-api

RUN pnpm --filter @sentinel0/common build && pnpm --filter @sentinel0/cloud-api build

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:23-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# pnpm symlinks each package's node_modules into the root .pnpm store, so the
# root tree has to come along with the per-package one. There is no
# packages/common/node_modules: common has no runtime dependencies of its own,
# and pnpm creates no directory for a package that needs none.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/cloud-api/node_modules ./packages/cloud-api/node_modules

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/cloud-api/package.json ./packages/cloud-api/
COPY --from=build /app/packages/cloud-api/dist ./packages/cloud-api/dist

WORKDIR /app/packages/cloud-api
EXPOSE 8080
CMD ["node", "dist/index.js"]
