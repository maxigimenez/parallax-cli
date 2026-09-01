import { defineRailway, postgres, preserve, project, service, volume } from 'railway/iac'

/**
 * The Railway project, in code.
 *
 * This replaces the per-service `railway.json` files. Config as Code is
 * deprecated — Railway stopped letting a service opt in on 2026-08-28 and
 * retires the mechanism on 2026-12-01 — and the API now refuses to set a
 * service's config file path at all.
 *
 * Describing both services in one file is better than what it replaces. There
 * is no root `railway.json` for a new service to inherit by accident, so the
 * failure that prompted this — the dashboard service silently building and
 * deploying the control plane's image, then passing its health check while
 * serving the wrong thing — is not merely fixed but unrepresentable. Every
 * service's builder and Dockerfile are stated here, next to each other.
 *
 *   railway config plan    preview, changes nothing
 *   railway config apply   apply after review
 */
export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: 'europe-west4-drams3a' })

  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '80': {}, '95': {}, '100': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 500,
  })

  // The control plane. Migrations run as a pre-deploy step so the schema is in
  // place before the new container takes traffic, and so a failed migration
  // stops the rollout rather than being discovered by the first request.
  const api = service('api', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: {
      startCommand: 'node dist/index.js',
      preDeployCommand: ['node dist/migrate-cli.js'],
      healthcheckPath: '/health',
      healthcheckTimeout: 30,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    replicas: { 'europe-west4-drams3a': 1 },
    // preserve() keeps the value already set on Railway without writing a
    // credential into source.
    env: { DATABASE_URL: preserve() },
  })

  // The dashboard. Its own Dockerfile, and no pre-deploy command — it owns no
  // database and has nothing to migrate.
  const dashboard = service('dashboard', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.dashboard' },
    deploy: {
      startCommand: 'node server.mjs',
      healthcheckPath: '/health',
      healthcheckTimeout: 30,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    replicas: { 'europe-west4-drams3a': 1 },
    // Read at runtime by server.mjs and served as /env.js, so pointing the
    // dashboard at a different control plane is a restart, not a rebuild.
    env: { PARALLAX_API_URL: preserve() },
  })

  return project('parallax', {
    resources: [api, dashboard, Postgres, postgresVolume],
  })
})
