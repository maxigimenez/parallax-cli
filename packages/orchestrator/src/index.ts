import pLimit from 'p-limit'
import { Server as SocketServer } from 'socket.io'
import { dbService } from './database.js'
import { GitService } from './git-service.js'
import { BaseAgentAdapter } from './ai-adapters/index.js'
import { loadConfig } from './config-loader.js'
import { logger, setIo, setLogLevels } from './logger.js'
import { ProjectConfig, TASK_STATUS, TaskPlanState, sleep } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { buildExternalServices, fetchProjectTasks } from './runtime/provider-services.js'
import { createApiServer } from './runtime/api-server.js'
import { validateRuntimeRequirements } from './runtime/preflight.js'
import { resolveUiDistPath, startUiServer } from './runtime/ui-server.js'
import {
  createAgentAdapter,
  processTask,
  processTaskPlan,
} from './workflow/task-runner.js'
import {
  deriveTaskMessage,
  isPlanAwaitingApproval,
  isTaskExecutable,
  normalizePlanState,
  requiresPlan,
} from './workflow/task-state.js'
import { taskLifecycle } from './task-lifecycle.js'

const activeWorktrees = new Map<string, string>()

async function startRuntimeServers(
  getConfig: () => Awaited<ReturnType<typeof loadConfig>>,
  reloadRuntime: () => Promise<Awaited<ReturnType<typeof loadConfig>>>,
  gitService: GitService,
  activeTasks: Set<string>,
  canceledTasks: Set<string>
) {
  const fastify = await createApiServer({
    getConfig,
    reloadRuntime,
    gitService,
    activeTasks,
    canceledTasks,
    activeWorktrees,
  })

  const config = getConfig()
  await fastify.listen({ port: config.server.apiPort, host: '0.0.0.0' })
  const io = new SocketServer(fastify.server, { cors: { origin: '*' } })
  setIo(io)

  if (process.env.NODE_ENV === 'dev') {
    return
  }

  const uiDistPath = resolveUiDistPath()
  if (uiDistPath) {
    await startUiServer(uiDistPath, config.server.uiPort, config.server.apiPort)
    logger.info(`UI server ready on http://localhost:${config.server.uiPort}`)
    return
  }
}

async function pollProjects(
  config: Awaited<ReturnType<typeof loadConfig>>,
  gitService: GitService,
  activeTasks: Set<string>,
  canceledTasks: Set<string>,
  getAdapterForProject: (project: ProjectConfig) => BaseAgentAdapter,
  services: ReturnType<typeof buildExternalServices>,
  limit: ReturnType<typeof pLimit>
) {
  for (const project of config.projects) {
    try {
      const adapter = getAdapterForProject(project)
      const issues = await fetchProjectTasks(project, services)
      const newIssues = issues.filter((task) => !dbService.getTaskByExternalId(task.externalId))

      if (newIssues.length > 0) {
        logger.info(`New tasks found for ${project.id}; syncing repository main branch.`)
        await gitService.syncMainBranch(project.workspaceDir)
      }

      for (const task of newIssues) {
        dbService.saveTask(task)
        const savedTask = dbService.getTaskByExternalId(task.externalId)!
        dbService.updateTaskPlanState(savedTask.id, TaskPlanState.PLAN_GENERATING)
        taskLifecycle.queue(savedTask.id, 'Queued for execution plan')
        logger.info(`New ticket discovered: ${task.externalId}`)
      }

      const pending = dbService
        .getPendingTasks()
        .filter((task) => task.projectId === project.id && !activeTasks.has(task.id))

      for (const task of pending) {
        if (canceledTasks.has(task.id) || task.status === TASK_STATUS.CANCELED) {
          continue
        }

        let taskPlanState: TaskPlanState
        try {
          taskPlanState = normalizePlanState(task)
        } catch (error: any) {
          logger.error(`Skipping task with invalid plan state: ${error.message}`, task.id)
          taskLifecycle.fail(task.id, `Invalid plan state: ${error.message}`)
          continue
        }

        if (isPlanAwaitingApproval(taskPlanState)) {
          taskLifecycle.queue(task.id, deriveTaskMessage(task))
          continue
        }

        if (
          taskPlanState === TaskPlanState.PLAN_REJECTED ||
          taskPlanState === TaskPlanState.PLAN_FAILED
        ) {
          continue
        }

        if (requiresPlan(task)) {
          activeTasks.add(task.id)
          limit(async () => {
            try {
              if (canceledTasks.has(task.id)) {
                return
              }
              await processTaskPlan(task, project, adapter, gitService, canceledTasks, services)
            } finally {
              canceledTasks.delete(task.id)
              activeTasks.delete(task.id)
            }
          })
          continue
        }

        if (!isTaskExecutable(task)) {
          continue
        }

        activeTasks.add(task.id)
        limit(async () => {
          try {
            if (canceledTasks.has(task.id)) {
              return
            }
            await processTask(
              task,
              project,
              adapter,
              gitService,
              canceledTasks,
              services,
              activeWorktrees
            )
          } finally {
            canceledTasks.delete(task.id)
            activeTasks.delete(task.id)
          }
        })
      }

    } catch (projectError: any) {
      logger.error(`Project poll error (${project.id}): ${projectError.message}`)
    }
  }
}

async function main() {
  const executor = new HostExecutor()
  let runtimeConfig = await loadConfig()
  setLogLevels(runtimeConfig.logs)
  await validateRuntimeRequirements(runtimeConfig, executor)

  let services = buildExternalServices(executor, {
    requiresGitHub: runtimeConfig.projects.length > 0,
    linearApiKey: process.env.LINEAR_API_KEY,
  })
  const getConfig = () => runtimeConfig
  const getServices = () => services
  const reloadRuntime = async () => {
    const nextConfig = await loadConfig()
    setLogLevels(nextConfig.logs)
    await validateRuntimeRequirements(nextConfig, executor)
    runtimeConfig = nextConfig
    services = buildExternalServices(executor, {
      requiresGitHub: nextConfig.projects.length > 0,
      linearApiKey: process.env.LINEAR_API_KEY,
    })
    return runtimeConfig
  }

  const gitService = new GitService(executor)
  const limit = pLimit(runtimeConfig.concurrency)
  const activeTasks = new Set<string>()
  const canceledTasks = new Set<string>()
  const adapterCache = new Map<string, BaseAgentAdapter>()

  const getAdapterForProject = (project: ProjectConfig) => {
    const key = `${project.id}:${project.agent.provider}`
    const existing = adapterCache.get(key)
    if (existing) {
      return existing
    }

    const adapter = createAgentAdapter(project, executor, logger)
    adapterCache.set(key, adapter)
    return adapter
  }

  await startRuntimeServers(getConfig, reloadRuntime, gitService, activeTasks, canceledTasks)

  while (true) {
    try {
      const config = getConfig()
      await pollProjects(
        config,
        gitService,
        activeTasks,
        canceledTasks,
        getAdapterForProject,
        getServices(),
        limit
      )
    } catch (error: any) {
      logger.error(`Poll Error: ${error.message}`)
    }

    await sleep(15000)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
