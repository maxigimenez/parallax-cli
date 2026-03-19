import pLimit from 'p-limit'
import { Server as SocketServer } from 'socket.io'
import { dbService } from './database.js'
import { GitService } from './git-service.js'
import { BaseAgentAdapter } from './ai-adapters/index.js'
import {
  ProjectConfig,
  TASK_REVIEW_STATE,
  TASK_STATUS,
  TaskPlanState,
  type Task,
  sleep,
} from '@parallax/common'
import { loadConfig } from './config-loader.js'
import { logger, setIo, setLogLevels } from './logger.js'
import { HostExecutor } from '@parallax/common/executor'
import { GitHubReviewService } from './github/review-service.js'
import { createTaskId } from './task-id.js'
import { buildExternalServices, fetchProjectTasks } from './runtime/provider-services.js'
import { createApiServer } from './runtime/api-server.js'
import { validateRuntimeRequirements } from './runtime/preflight.js'
import { resolveUiDistPath, startUiServer } from './runtime/ui-server.js'
import {
  createAgentAdapter,
  processPullRequestReview,
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
  triggerPullRequestReview: (taskId: string) => Promise<{ reviewTaskId: string; prNumber: number }>,
  gitService: GitService,
  activeTasks: Set<string>,
  canceledTasks: Set<string>
) {
  const fastify = await createApiServer({
    getConfig,
    reloadRuntime,
    triggerPullRequestReview,
    gitService,
    activeTasks,
    canceledTasks,
    activeWorktrees,
  })

  const config = getConfig()
  await fastify.listen({ port: config.server.apiPort, host: '127.0.0.1' })
  const io = new SocketServer(fastify.server, {
    cors: { origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ },
  })
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

function createPullRequestReviewTask(originalTask: Task, project: ProjectConfig): Task {
  if (!originalTask.prNumber || !originalTask.branchName || !originalTask.prUrl) {
    throw new Error(`Task ${originalTask.id} does not have a related open PR.`)
  }

  const externalId = `${originalTask.externalId}/pr-review/${Date.now()}`
  const now = Date.now()

  return {
    id: createTaskId(project.id, externalId),
    externalId,
    title: `PR Review: ${originalTask.title}`,
    description: `On-demand PR review remediation for ${originalTask.externalId} on PR #${originalTask.prNumber}.`,
    status: TASK_STATUS.PENDING,
    projectId: project.id,
    branchName: originalTask.branchName,
    prUrl: originalTask.prUrl,
    prNumber: originalTask.prNumber,
    reviewState: TASK_REVIEW_STATE.REVIEW_PENDING,
    createdAt: now,
    updatedAt: now,
    executionAttempts: 0,
    planState: TaskPlanState.NOT_REQUIRED,
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
  const reviewService = new GitHubReviewService(executor)
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

  const triggerPullRequestReview = async (sourceTaskId: string) => {
    const sourceTask = dbService.getTaskByLookup(sourceTaskId)
    if (!sourceTask) {
      throw new Error(`Task ${sourceTaskId} not found.`)
    }

    const project = getConfig().projects.find((candidate) => candidate.id === sourceTask.projectId)
    if (!project) {
      throw new Error(`Project ${sourceTask.projectId} not found in config.`)
    }

    if (!sourceTask.prNumber || sourceTask.prNumber < 1) {
      throw new Error(`Task ${sourceTask.id} does not have a related open PR.`)
    }

    const pullRequestDetails = await reviewService.getPullRequestDetails(
      project,
      sourceTask.prNumber
    )
    if (pullRequestDetails.state !== 'OPEN') {
      throw new Error(`Task ${sourceTask.id} does not have a related open PR.`)
    }

    const comments = await reviewService.listOpenReviewComments(project, sourceTask.prNumber)
    if (comments.length === 0) {
      throw new Error(`PR #${sourceTask.prNumber} does not have open human review comments.`)
    }

    const reviewTask = createPullRequestReviewTask(
      {
        ...sourceTask,
        branchName: sourceTask.branchName ?? pullRequestDetails.headRefName,
        prUrl: sourceTask.prUrl ?? pullRequestDetails.url,
      },
      project
    )

    dbService.saveTask(reviewTask)
    dbService.updateTaskPlanOutput(reviewTask.id, {
      planState: TaskPlanState.NOT_REQUIRED,
      planPrompt: 'On-demand pull request review remediation.',
    })
    dbService.updateTaskReviewState(reviewTask.id, TASK_REVIEW_STATE.REVIEW_PENDING)

    const adapter = getAdapterForProject(project)
    activeTasks.add(reviewTask.id)
    taskLifecycle.queue(reviewTask.id, `Queued PR review run for #${reviewTask.prNumber}`)
    void limit(async () => {
      try {
        await processPullRequestReview(
          reviewTask,
          project,
          adapter,
          gitService,
          reviewService,
          comments,
          canceledTasks,
          activeWorktrees
        )
      } finally {
        canceledTasks.delete(reviewTask.id)
        activeTasks.delete(reviewTask.id)
      }
    }).catch((error: any) => {
      logger.error(`Failed to schedule PR review run: ${error.message}`, reviewTask.id)
      taskLifecycle.fail(reviewTask.id, `Failed to schedule PR review run: ${error.message}`)
    })

    return {
      reviewTaskId: reviewTask.id,
      prNumber: reviewTask.prNumber!,
    }
  }

  await startRuntimeServers(
    getConfig,
    reloadRuntime,
    triggerPullRequestReview,
    gitService,
    activeTasks,
    canceledTasks
  )

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
