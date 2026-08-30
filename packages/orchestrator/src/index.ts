import os from 'node:os'
import pLimit from 'p-limit'
import {
  sleep,
  type AgentDescriptor,
  type AppConfig,
  type ProjectConfig,
  type RoutingRule,
  type TriggerEvent,
} from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { loadConfig, resolveDataDir } from './config-loader.js'
import { getDatabase } from './database.js'
import { logger, setLoggerDatabase, setLogLevels } from './logger.js'
import { createRunId } from './run-id.js'
import { HermesAdapter } from './hermes/adapter.js'
import { createClientForProfile, discoverAgents } from './hermes/discovery.js'
import { Dispatcher } from './routing/dispatcher.js'
import { RunLifecycle } from './routing/run-lifecycle.js'
import { CloudClient, MirrorOutbox, type RunnerCommand } from './cloud/client.js'
import { loadCachedRoutes, saveCachedRoutes } from './routing/route-cache.js'
import { buildProviderServices, trackerWriterFor, triggerSourceFor } from './runtime/services.js'
import { createApiServer } from './runtime/api-server.js'
import { validateRuntimeRequirements } from './runtime/preflight.js'

/** Fallback cadence when there is no cloud to long-poll against. */
const OFFLINE_POLL_INTERVAL_MS = 20_000

const RUNNER_VERSION = process.env.PARALLAX_VERSION ?? '0.2.0'

interface Runtime {
  config: AppConfig
  agents: AgentDescriptor[]
  adapters: Map<string, HermesAdapter>
  routes: RoutingRule[]
  cloud?: CloudClient
  outbox?: MirrorOutbox
}

function buildAdapters(config: AppConfig): Map<string, HermesAdapter> {
  const adapters = new Map<string, HermesAdapter>()
  if (!config.hermes) {
    return adapters
  }
  for (const profile of config.hermes.profiles) {
    if (!profile.enabled) {
      continue
    }
    adapters.set(
      profile.name,
      new HermesAdapter(createClientForProfile(config.hermes, profile), logger)
    )
  }
  return adapters
}

/**
 * Discovers agents and, when a cloud is configured, publishes the inventory.
 *
 * Discovery failures are reported but never fatal: five healthy profiles should
 * keep working while one has a stale key.
 */
async function refreshInventory(
  config: AppConfig,
  cloud?: CloudClient
): Promise<AgentDescriptor[]> {
  if (!config.hermes) {
    logger.warn('No Hermes configuration; no agents available. Run "parallax init".')
    return []
  }

  const { agents, failures } = await discoverAgents(config.hermes)
  for (const failure of failures) {
    logger.error(`Hermes profile "${failure.profile}" is unreachable: ${failure.error}`)
  }
  logger.info(
    `Discovered ${agents.length} Hermes agent(s): ${agents.map((a) => a.profile).join(', ') || 'none'}`
  )

  if (cloud && agents.length > 0) {
    try {
      await cloud.pushInventory(agents)
    } catch (error: unknown) {
      logger.warn(`Failed to publish agent inventory: ${errorMessage(error)}`)
    }
  }

  return agents
}

/**
 * Pulls routes from the cloud, falling back to the last known good set.
 *
 * The runner must keep dispatching through a cloud outage, so a fetch failure
 * degrades to the on-disk cache rather than silently disabling every route.
 */
async function refreshRoutes(dataDir: string, cloud?: CloudClient): Promise<RoutingRule[]> {
  if (!cloud) {
    return loadCachedRoutes(dataDir)
  }

  try {
    const { routes } = await cloud.fetchRoutes()
    await saveCachedRoutes(dataDir, routes)
    return routes
  } catch (error: unknown) {
    const cached = await loadCachedRoutes(dataDir)
    logger.warn(
      `Could not fetch routes (${errorMessage(error)}); using ${cached.length} cached route(s).`
    )
    return cached
  }
}

async function collectEvents(
  project: ProjectConfig,
  services: ReturnType<typeof buildProviderServices>
): Promise<TriggerEvent[]> {
  try {
    return await triggerSourceFor(project, services).collect(project)
  } catch (error: unknown) {
    logger.error(`Trigger collection failed for project "${project.id}": ${errorMessage(error)}`)
    return []
  }
}

async function main(): Promise<void> {
  const executor = new HostExecutor()
  const dataDir = resolveDataDir()
  const db = getDatabase()
  setLoggerDatabase(db)

  let config = await loadConfig()
  setLogLevels(config.logs)
  await validateRuntimeRequirements(config, executor)

  const cloud = config.cloud ? new CloudClient(config.cloud) : undefined
  const outbox = cloud ? new MirrorOutbox(cloud, (message) => logger.warn(message)) : undefined

  if (cloud) {
    try {
      const hello = await cloud.hello(os.hostname(), RUNNER_VERSION)
      logger.success(`Registered with Parallax cloud as runner ${hello.runnerId}`)
    } catch (error: unknown) {
      // Not fatal: a runner that cannot reach the cloud still dispatches from
      // its cached routes, which is the whole point of caching them.
      logger.warn(`Cloud registration failed: ${errorMessage(error)}`)
    }
  } else {
    logger.warn('No cloud configured; routes will be read from the local cache only.')
  }

  const runtime: Runtime = {
    config,
    agents: await refreshInventory(config, cloud),
    adapters: buildAdapters(config),
    routes: await refreshRoutes(dataDir, cloud),
    cloud,
    outbox,
  }

  logger.info(`Loaded ${runtime.routes.length} route(s).`)

  const lifecycle = new RunLifecycle(db, logger)
  const limit = pLimit(config.concurrency)
  const inFlight = new Map<string, AbortController>()

  let services = buildProviderServices(config, executor)

  const reload = async (): Promise<AppConfig> => {
    config = await loadConfig()
    setLogLevels(config.logs)
    await validateRuntimeRequirements(config, executor)
    runtime.config = config
    runtime.adapters = buildAdapters(config)
    runtime.agents = await refreshInventory(config, cloud)
    runtime.routes = await refreshRoutes(dataDir, cloud)
    services = buildProviderServices(config, executor)
    return config
  }

  const dispatcherFor = (project: ProjectConfig) =>
    new Dispatcher({
      db,
      logger,
      lifecycle,
      outcomes: trackerWriterFor(project, services),
      adapters: runtime.adapters,
      agents: runtime.agents,
      newRunId: createRunId,
      inFlight,
    })

  const cancelRun = async (runId: string): Promise<boolean> => {
    const controller = inFlight.get(runId)
    if (controller) {
      controller.abort()
      return true
    }
    // Not running locally: it may still be alive on the Hermes side after a
    // runner restart, so stop it there too rather than only marking the row.
    const run = db.getRun(runId)
    if (run?.hermesRunId) {
      const adapter = runtime.adapters.get(run.agentProfile)
      if (adapter) {
        await adapter.cancel(run.hermesRunId).catch(() => undefined)
      }
    }
    if (run) {
      lifecycle.canceled(runId, 'Canceled by operator.')
      return true
    }
    return false
  }

  const fastify = await createApiServer({
    getConfig: () => runtime.config,
    getAgents: () => runtime.agents,
    getRoutes: () => runtime.routes,
    reload,
    cancelRun,
    db,
    dataDir,
  })

  await fastify.listen({
    port: config.server.apiPort,
    host: config.server.networkAccess ? '0.0.0.0' : '127.0.0.1',
  })
  logger.success(`Runner API listening on port ${config.server.apiPort}`)

  const runDispatch = (project: ProjectConfig, event: TriggerEvent): Promise<void> =>
    limit(async () => {
      const result = await dispatcherFor(project).dispatch(event, runtime.routes)
      if (result.outcome === 'skipped' && result.detail) {
        logger.info(result.detail)
      }
    }).catch((error: unknown) => {
      logger.error(`Dispatch failed for ${event.ref}: ${errorMessage(error)}`)
    })

  const handleCommand = async (command: RunnerCommand): Promise<void> => {
    switch (command.type) {
      case 'cancel': {
        const runId = String(command.payload.runId ?? '')
        logger.info(`Cloud requested cancellation of ${runId}`)
        await cancelRun(runId)
        break
      }
      case 'resync': {
        logger.info('Cloud requested a resync')
        await reload()
        break
      }
      case 'run': {
        // A human pressing "run this now" is just another trigger event.
        const event = command.payload.event as TriggerEvent | undefined
        const project = runtime.config.projects.find((entry) => entry.id === event?.projectId)
        if (!event || !project) {
          logger.warn(`Ignoring manual run command with no resolvable project.`)
          return
        }
        await runDispatch(project, event)
        break
      }
    }
  }

  let cursor = 0
  let pollFailures = 0

  for (;;) {
    try {
      await outbox?.flush()

      for (const project of runtime.config.projects) {
        const events = await collectEvents(project, services)
        for (const event of events) {
          void runDispatch(project, event)
        }
      }

      db.pruneDispatchLedger(Date.now() - 30 * 24 * 60 * 60 * 1_000)
    } catch (error: unknown) {
      logger.error(`Poll cycle error: ${errorMessage(error)}`)
    }

    // The long poll doubles as the loop's pacing: it returns as soon as a human
    // queues something, and otherwise costs one held connection per window.
    if (cloud) {
      try {
        const { commands } = await cloud.pollCommands(cursor)
        pollFailures = 0
        for (const command of commands) {
          cursor = Math.max(cursor, command.cursor)
          await handleCommand(command)
        }
        if (commands.length > 0) {
          await cloud.ackCommands(cursor).catch(() => undefined)
        }
      } catch (error: unknown) {
        pollFailures += 1
        const backoff = Math.min(60_000, 2 ** Math.min(pollFailures, 5) * 1_000)
        logger.warn(
          `Command poll failed (${pollFailures}); retrying in ${backoff / 1000}s: ${errorMessage(error)}`
        )
        await sleep(backoff)
      }
    } else {
      await sleep(OFFLINE_POLL_INTERVAL_MS)
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
