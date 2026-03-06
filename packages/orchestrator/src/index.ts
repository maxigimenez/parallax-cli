import path from 'path'
import dotenv from 'dotenv'
import pLimit from 'p-limit'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server as SocketServer } from 'socket.io'
import { dbService } from './database.js'
import { LinearService } from './linear-service.js'
import { GitHubService } from './github-service.js'
import { GitHubPullRequestService, PullRequestReviewContext } from './github-pr-service.js'
import { GitService } from './git-service.js'
import { GeminiAdapter, CodexAdapter, BaseAgentAdapter } from '@parallax/agent-adapters'
import { loadConfig } from './config-loader.js'
import {
  logger,
  setIo,
  setLogLevels,
  printHeader,
  getTaskStatuses,
  getTaskLogs,
  setTaskQueued,
  setTaskRunning,
  setTaskDone,
  setTaskFailed,
  setTaskCanceled,
  clearTaskState,
} from './logger.js'
import {
  Task,
  ProjectConfig,
  HostExecutor,
  TaskPlanState,
  PlanResult,
  PlanResultStatus,
} from '@parallax/common'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') })

const fastify = Fastify({ logger: false })
const PORT = 3000
const activeWorktrees = new Map<string, string>()
const MAX_EXECUTION_ATTEMPTS = 2
const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

type TaskDiffFile = {
  path: string
  status: 'A' | 'M' | 'D' | 'R'
}

function splitUnifiedDiffByFile(
  diffText: string
): Map<string, { patch: string; status: TaskDiffFile['status'] }> {
  const result = new Map<string, { patch: string; status: TaskDiffFile['status'] }>()
  if (!diffText.trim()) {
    return result
  }

  const chunks = diffText.split(/^diff --git /m).filter((chunk) => chunk.trim())
  for (const rawChunk of chunks) {
    const chunk = `diff --git ${rawChunk}`
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    if (!headerMatch) {
      continue
    }

    const path = headerMatch[2].trim()
    let status: TaskDiffFile['status'] = 'M'
    if (/^new file mode\s/m.test(chunk)) {
      status = 'A'
    } else if (/^deleted file mode\s/m.test(chunk)) {
      status = 'D'
    } else if (/^rename from\s/m.test(chunk) || /^rename to\s/m.test(chunk)) {
      status = 'R'
    }

    result.set(path, { patch: chunk.trim(), status })
  }

  return result
}

function deriveTaskMessage(task: Task): string {
  const planState = normalizePlanState(task)
  const reviewState = `${task.reviewState || 'NONE'}`

  if (task.status === 'CANCELED') {
    return 'Task canceled'
  }

  if (reviewState === 'WAITING_FOR_REVIEW') {
    return task.prUrl ? `Waiting for review on ${task.prUrl}` : 'Waiting for review'
  }

  if (reviewState === 'REVISION_PUSHED') {
    return 'Review changes pushed to PR'
  }

  if (task.status === 'COMPLETED') {
    return task.prUrl ? `PR ready: ${task.prUrl}` : 'Task completed'
  }

  if (task.status === 'FAILED') {
    return 'Task failed'
  }

  if (planState === TaskPlanState.PLAN_GENERATING) {
    return 'Generating execution plan'
  }

  if (planState === TaskPlanState.PLAN_FAILED) {
    return 'Plan generation failed'
  }

  if (planState === TaskPlanState.PLAN_READY) {
    return reviewState === 'WAITING_FOR_REVIEW' ? 'Plan submitted' : 'Awaiting plan approval'
  }

  if (planState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION) {
    return 'Plan requires clarification'
  }

  if (planState === TaskPlanState.PLAN_REJECTED) {
    return 'Plan rejected'
  }

  if (planState === TaskPlanState.PLAN_APPROVED || planState === TaskPlanState.NOT_REQUIRED) {
    return 'Queued for execution'
  }

  return 'Queued for execution'
}

class TaskCanceledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was canceled`)
  }
}

function buildReviewFeedbackPreview(feedback: string): string {
  const normalized = feedback.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 200) {
    return normalized
  }

  return `${normalized.slice(0, 200)}...`
}

function throwIfCancellationRequested(taskId: string, canceledTasks: Set<string>) {
  if (canceledTasks.has(taskId)) {
    throw new TaskCanceledError(taskId)
  }
}

function getPullProvider(project: ProjectConfig) {
  return project.pullFrom.provider
}

function isTaskPlanState(value: string | undefined): value is TaskPlanState {
  return (
    value === TaskPlanState.NOT_REQUIRED ||
    value === TaskPlanState.PLAN_GENERATING ||
    value === TaskPlanState.PLAN_READY ||
    value === TaskPlanState.PLAN_REQUIRES_CLARIFICATION ||
    value === TaskPlanState.PLAN_APPROVED ||
    value === TaskPlanState.PLAN_REJECTED ||
    value === TaskPlanState.PLAN_FAILED
  )
}

function isPlanAwaitingApproval(planState: TaskPlanState): boolean {
  return (
    planState === TaskPlanState.PLAN_READY ||
    planState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION
  )
}

function getNextPlanState(status: PlanResultStatus): TaskPlanState {
  if (status === PlanResultStatus.PLAN_READY) {
    return TaskPlanState.PLAN_READY
  }

  if (status === PlanResultStatus.NEEDS_CLARIFICATION) {
    return TaskPlanState.PLAN_REQUIRES_CLARIFICATION
  }

  return TaskPlanState.PLAN_FAILED
}

function assertTaskPlanState(task: Task, value: string | undefined): TaskPlanState {
  if (isTaskPlanState(value)) {
    return value
  }

  throw new Error(`Task ${task.externalId} has invalid planState '${value ?? 'undefined'}'.`)
}

function normalizePlanState(task: Task): TaskPlanState {
  return assertTaskPlanState(task, task.planState)
}

function getTaskPlanPrompt(task: Task): string {
  return task.planPrompt || `Auto-generated task prompt for ${task.externalId}`
}

function isPlaceholderPlanError(error: string | undefined): boolean {
  if (!error) {
    return false
  }

  return error.toLowerCase().includes('approved plan contains placeholders')
}

function isRetryableExecution(task: Task): boolean {
  return (task.executionAttempts || 0) < MAX_EXECUTION_ATTEMPTS
}

function requiresPlan(task: Task): boolean {
  const state = normalizePlanState(task)
  return state !== TaskPlanState.NOT_REQUIRED && state !== TaskPlanState.PLAN_APPROVED
}

function createAgentAdapter(
  project: ProjectConfig,
  executor: HostExecutor,
  currentLog: typeof logger
): BaseAgentAdapter {
  const provider = project.agent.provider

  if (provider === 'codex') {
    return new CodexAdapter(executor, currentLog)
  }

  if (provider === 'gemini') {
    return new GeminiAdapter(executor, currentLog)
  }

  if (provider === 'claude-code') {
    throw new Error(`Agent provider "claude-code" is not implemented yet.`)
  }

  throw new Error(`Agent provider "${provider}" is not supported.`)
}

async function fetchProjectTasks(
  project: ProjectConfig,
  services: {
    linearService?: LinearService
    githubService?: GitHubService
    githubPullRequestService?: GitHubPullRequestService
  }
): Promise<Task[]> {
  const provider = getPullProvider(project)

  if (provider === 'linear') {
    if (!services.linearService) {
      throw new Error('LINEAR_API_KEY missing from environment.')
    }
    return services.linearService.fetchNewIssues(project)
  }

  if (!services.githubService) {
    throw new Error('GitHub CLI not configured.')
  }

  return services.githubService.fetchNewIssues(project)
}

async function markTaskInProgress(
  task: Task,
  project: ProjectConfig,
  services: {
    linearService?: LinearService
    githubService?: GitHubService
    githubPullRequestService?: GitHubPullRequestService
  }
) {
  const provider = getPullProvider(project)

  if (provider === 'linear') {
    if (!services.linearService) {
      throw new Error('LINEAR_API_KEY missing from environment.')
    }
    await services.linearService.markAsInProgress(task.externalId)
    return
  }

  if (!services.githubService) {
    throw new Error('GitHub CLI not configured.')
  }

  await services.githubService.markAsInProgress(task.externalId, project)
}

async function processTaskPlan(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: {
    linearService?: LinearService
    githubService?: GitHubService
    githubPullRequestService?: GitHubPullRequestService
  }
) {
  logger.info(`Starting plan generation: ${task.title}`, task.id)
  dbService.updateTaskStatus(task.id, 'IN_PROGRESS')
  dbService.updateTaskPlanState(task.id, TaskPlanState.PLAN_GENERATING)
  setTaskRunning(task.id, 'Generating plan')

  let planResult: PlanResult | undefined

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    await markTaskInProgress(task, project, services)
    throwIfCancellationRequested(task.id, canceledTasks)

    const tempBaseDir = path.resolve(process.cwd(), 'worktrees')
    const worktreePath = await gitService.createWorktree(task, project, tempBaseDir)

    logger.info(`Plan worktree created: ${worktreePath}`, task.id)
    planResult = await adapter.runPlan(task, worktreePath, project)
    throwIfCancellationRequested(task.id, canceledTasks)

    const nextState = getNextPlanState(planResult.status)

    dbService.updateTaskPlanOutput(task.id, {
      planState: nextState,
      planMarkdown: planResult.planMarkdown || null,
      planPrompt: getTaskPlanPrompt(task),
      planResult: planResult.output,
      lastAgent: project.agent.provider,
    })

    if (nextState === TaskPlanState.PLAN_READY) {
      dbService.updateTaskStatus(task.id, 'PENDING')
      setTaskQueued(task.id, 'Plan ready. Awaiting approval.')
      return
    }

    if (nextState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION) {
      dbService.updateTaskStatus(task.id, 'PENDING')
      setTaskQueued(task.id, 'Plan needs clarification. Please review before approval.')
      return
    }

    dbService.updateTaskStatus(task.id, 'FAILED')
    setTaskFailed(task.id, planResult.error || 'Plan generation failed')
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      dbService.updateTaskStatus(task.id, 'CANCELED')
      setTaskCanceled(task.id, 'Plan generation canceled')
      return
    }

    logger.error(`Plan generation critical error: ${error.message}`, task.id)

    dbService.updateTaskPlanState(task.id, TaskPlanState.PLAN_FAILED)
    dbService.updateTaskStatus(task.id, 'FAILED')
    setTaskFailed(task.id, `Critical error while generating plan: ${error.message}`)
  } finally {
    if (task.externalId) {
      try {
        const worktreePath = path.resolve(process.cwd(), 'worktrees', task.externalId)
        await gitService.removeWorktree(worktreePath, project.workspaceDir)
      } catch {
        // Best effort cleanup
      }
    }
  }
}

async function processTask(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: {
    linearService?: LinearService
    githubService?: GitHubService
    githubPullRequestService?: GitHubPullRequestService
  }
) {
  logger.info(`Starting process: ${task.title}`, task.id)

  if (!isTaskExecutable(task)) {
    logger.warn('Skipping execution due to incomplete plan state.', task.id)
    return
  }

  if (!isRetryableExecution(task)) {
    logger.warn('Execution attempt limit reached. Skipping task.', task.id)
    dbService.updateTaskStatus(task.id, 'FAILED')
    setTaskFailed(task.id, 'Execution attempt limit reached.')
    return
  }

  dbService.updateTaskStatus(task.id, 'IN_PROGRESS')
  setTaskRunning(task.id, `Starting execution: ${task.title}`)
  dbService.incrementExecutionAttempts(task.id)
  let worktreePath: string | undefined

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    await markTaskInProgress(task, project, services)
    throwIfCancellationRequested(task.id, canceledTasks)

    const tempBaseDir = path.resolve(process.cwd(), 'worktrees')
    worktreePath = await gitService.createWorktree(task, project, tempBaseDir)
    activeWorktrees.set(task.id, worktreePath)

    logger.info(`Worktree created: ${worktreePath}`, task.id)
    logger.info('Syncing worktree with latest origin/main before starting AI...', task.id)
    await gitService.fastForwardBranchToMain(worktreePath)

    throwIfCancellationRequested(task.id, canceledTasks)
    const result = await adapter.runTask(task, worktreePath, project, task.planMarkdown)
    throwIfCancellationRequested(task.id, canceledTasks)

    if (result.success) {
      const branchName = await gitService.commitAndPush(worktreePath, task)
      if (!branchName) {
        logger.error(`No changes made by agent.`, task.id)
        dbService.updateTaskStatus(task.id, 'FAILED')
        setTaskFailed(task.id, 'No changes made by agent.')
      } else {
        const prUrl = await gitService.createPullRequest(worktreePath, task, {
          prTitle: result.prTitle,
          prSummary: result.prSummary,
        })
        const prNumberMatch = prUrl.match(/\/pull\/(\d+)/)
        if (prNumberMatch) {
          dbService.updateTaskPullRequestInfo(task.id, {
            branchName,
            prUrl,
            prNumber: Number.parseInt(prNumberMatch[1], 10),
          })
        }
        logger.success(`PR Created: ${prUrl}`, task.id)
        dbService.updateTaskStatus(task.id, 'COMPLETED')
        setTaskDone(task.id, `PR Created: ${prUrl}`)
        dbService.updateTaskPlanOutput(task.id, {
          planState: TaskPlanState.PLAN_APPROVED,
          planPrompt: getTaskPlanPrompt(task),
          lastAgent: project.agent.provider,
        })

        setTimeout(() => {
          clearTaskState(task.id)
        }, 60000)
      }
    } else {
      if (isPlaceholderPlanError(result.error)) {
        dbService.updateTaskPlanOutput(task.id, {
          planState: TaskPlanState.PLAN_REQUIRES_CLARIFICATION,
          planResult: result.error,
          planPrompt: getTaskPlanPrompt(task),
          lastAgent: project.agent.provider,
        })
        dbService.updateTaskStatus(task.id, 'PENDING')
        setTaskQueued(
          task.id,
          'Plan requires clarification. Please provide concrete approved steps.'
        )
        logger.warn(`Execution blocked: ${result.error}`, task.id)
        return
      }

      logger.error(`Agent failed: ${result.error}`, task.id)
      dbService.updateTaskStatus(task.id, 'FAILED')
      setTaskFailed(task.id, `Agent failed: ${result.error}`)
    }
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      dbService.updateTaskStatus(task.id, 'CANCELED')
      setTaskCanceled(task.id, 'Task canceled before completion.')
      logger.warn('Task canceled before completion.', task.id)
      return
    }

    logger.error(`Critical error: ${error.message}`, task.id)
    dbService.updateTaskStatus(task.id, 'FAILED')
    setTaskFailed(task.id, `Critical error: ${error.message}`)
  } finally {
    activeWorktrees.delete(task.id)
    if (worktreePath) {
      await gitService.removeWorktree(worktreePath, project.workspaceDir)
    }
  }
}

function isTaskExecutable(task: Task): boolean {
  const state = normalizePlanState(task)
  return state === TaskPlanState.PLAN_APPROVED || state === TaskPlanState.NOT_REQUIRED
}

async function processPullRequestReview(
  task: Task,
  project: ProjectConfig,
  review: PullRequestReviewContext,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>
) {
  logger.info(`Starting PR review follow-up for ${review.prUrl}`, task.id)
  dbService.updateTaskStatus(task.id, 'IN_PROGRESS')
  setTaskRunning(task.id, `Starting PR review follow-up for ${review.prUrl}`)
  dbService.updateTaskReviewState(task.id, 'REVIEW_PENDING')
  dbService.updateTaskReviewEventAt(task.id, review.latestFeedbackAt)

  let worktreePath: string | undefined

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    const tempBaseDir = path.resolve(process.cwd(), 'worktrees')
    const reviewTask: Task = {
      ...task,
      branchName: review.branchName,
      prNumber: review.prNumber,
      prUrl: review.prUrl,
      lastReviewEventAt: review.latestFeedbackAt,
    }

    logger.info(
      `Review feedback preview: ${buildReviewFeedbackPreview(review.feedback)}`,
      task.id
    )
    dbService.updateTaskReviewState(task.id, 'SYNCING_MAIN')
    worktreePath = await gitService.createWorktreeForExistingBranch(
      reviewTask,
      project,
      tempBaseDir
    )
    activeWorktrees.set(task.id, worktreePath)
    logger.info(`Review worktree created: ${worktreePath}`, task.id)

    const mergeResult = await gitService.mergeMainIntoBranch(worktreePath)
    if (mergeResult.conflicted) {
      dbService.updateTaskReviewState(task.id, 'RESOLVING_CONFLICTS')
      logger.warn(
        'Merge conflicts detected while syncing with main. Asking AI to resolve them.',
        task.id
      )
      const conflictResolution = await adapter.runMergeConflictResolution(
        reviewTask,
        worktreePath,
        project,
        review
      )

      if (!conflictResolution.success) {
        logger.error(`Conflict resolution failed: ${conflictResolution.error}`, task.id)
        dbService.updateTaskStatus(task.id, 'FAILED')
        setTaskFailed(task.id, `Conflict resolution failed: ${conflictResolution.error}`)
        return
      }
    }

    throwIfCancellationRequested(task.id, canceledTasks)
    dbService.updateTaskReviewState(task.id, 'APPLYING_REVIEW')
    const reviewFixResult = await adapter.runReviewFixPass(
      reviewTask,
      worktreePath,
      project,
      review
    )
    throwIfCancellationRequested(task.id, canceledTasks)
    if (!reviewFixResult.success) {
      logger.error(`Review fix pass failed: ${reviewFixResult.error}`, task.id)
      dbService.updateTaskStatus(task.id, 'FAILED')
      setTaskFailed(task.id, `Review fix pass failed: ${reviewFixResult.error}`)
      return
    }

    const branchName = await gitService.commitAndPush(worktreePath, reviewTask)
    if (!branchName) {
      logger.error('No changes made while addressing PR review feedback.', task.id)
      dbService.updateTaskStatus(task.id, 'FAILED')
      setTaskFailed(task.id, 'No changes made while addressing PR review feedback.')
      return
    }

    logger.success(`PR Updated: ${review.prUrl}`, task.id)
    dbService.updateTaskReviewState(task.id, 'REVISION_PUSHED')
    dbService.updateTaskStatus(task.id, 'COMPLETED')
    setTaskDone(task.id, `PR Updated: ${review.prUrl}`)
    setTimeout(() => {
      clearTaskState(task.id)
    }, 60000)
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      dbService.updateTaskStatus(task.id, 'CANCELED')
      setTaskCanceled(task.id, 'Task canceled before review follow-up completed.')
      logger.warn('Task canceled before review follow-up completed.', task.id)
      return
    }
    logger.error(`Critical review error: ${error.message}`, task.id)
    dbService.updateTaskStatus(task.id, 'FAILED')
    setTaskFailed(task.id, `Critical review error: ${error.message}`)
  } finally {
    activeWorktrees.delete(task.id)
    if (worktreePath) {
      await gitService.removeWorktree(worktreePath, project.workspaceDir)
    }
  }
}

function normalizeTaskForApi(task: Task): Task {
  return {
    ...task,
    planState: normalizePlanState(task),
    executionAttempts: task.executionAttempts || 0,
  }
}

type RetryMode = 'full' | 'execution'

function parseRetryMode(value: string | undefined): RetryMode {
  if (!value) {
    return 'full'
  }

  if (value === 'full' || value === 'execution') {
    return value
  }

  throw new Error(`Invalid retry mode '${value}'. Use 'full' or 'execution'.`)
}

function inferMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  return STATIC_MIME[extension] || 'application/octet-stream'
}

async function main() {
  const config = await loadConfig()
  setLogLevels(config.logs)

  printHeader()

  const requiresLinear = config.projects.some((project) => project.pullFrom.provider === 'linear')
  const requiresGitHub = config.projects.length > 0

  if (requiresLinear && !process.env.LINEAR_API_KEY) {
    console.error('LINEAR_API_KEY missing from environment.')
    process.exit(1)
  }

  const executor = new HostExecutor()

  const ghCheck = requiresGitHub
    ? await executor.executeCommand(['gh', 'auth', 'status'], { cwd: process.cwd() })
    : { exitCode: 0, output: '' }

  if (requiresGitHub && ghCheck.exitCode !== 0) {
    console.error('GitHub CLI is not authenticated. Run `gh auth login`.')
    process.exit(1)
  }

  const services = {
    linearService: process.env.LINEAR_API_KEY
      ? new LinearService(process.env.LINEAR_API_KEY)
      : undefined,
    githubService: requiresGitHub ? new GitHubService(executor) : undefined,
    githubPullRequestService: requiresGitHub ? new GitHubPullRequestService(executor) : undefined,
  }
  const gitService = new GitService(executor)
  const limit = pLimit(config.concurrency)
  const activeTasks = new Set<string>()
  const canceledTasks = new Set<string>()
  const adapterCache = new Map<string, BaseAgentAdapter>()

  const getAdapterForProject = (project: ProjectConfig) => {
    const key = `${project.id}:${project.agent.provider}`

    if (adapterCache.has(key)) {
      return adapterCache.get(key) as BaseAgentAdapter
    }

    const adapter = createAgentAdapter(project, executor, logger)
    adapterCache.set(key, adapter)
    return adapter
  }

  await fastify.register(cors, { origin: '*' })
  fastify.get('/tasks', async () =>
    dbService.listTasks().map((task) => {
      const liveInfo = getTaskStatuses().get(task.id)
      const normalized = normalizeTaskForApi(task)

      return {
        ...normalized,
        msg: liveInfo?.msg || deriveTaskMessage(task),
        startTime: liveInfo?.startTime || task.updatedAt,
        status:
          liveInfo?.status ||
          (task.status === 'IN_PROGRESS'
            ? 'running'
            : task.status === 'COMPLETED'
              ? 'done'
              : task.status === 'FAILED'
                ? 'failed'
                : task.status === 'CANCELED'
                  ? 'canceled'
                  : 'queued'),
        logs: getTaskLogs().get(task.id) || dbService.getLogsByTaskExternalId(task.id),
        branchName: task.branchName,
        prUrl: task.prUrl,
        prNumber: task.prNumber,
        lastReviewEventAt: task.lastReviewEventAt,
        reviewState: task.reviewState || 'NONE',
      }
    })
  )

  fastify.get('/tasks/pending-plans', async () =>
    dbService
      .listTasks()
      .filter(
        (task) => task.status === 'PENDING' && isPlanAwaitingApproval(normalizePlanState(task))
      )
      .map((task) => normalizeTaskForApi(task))
  )

  fastify.get('/config', async () => config)

  fastify.get('/logs', async (request, reply) => {
    const { since, taskId, limit } = request.query as {
      since?: string
      taskId?: string
      limit?: string
    }

    const parsedSince = since ? Number.parseInt(since, 10) : 0
    if (!Number.isFinite(parsedSince) || parsedSince < 0) {
      return reply.status(400).send({ error: 'since must be a non-negative integer.' })
    }

    const parsedLimit = limit ? Number.parseInt(limit, 10) : 200
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      return reply.status(400).send({ error: 'limit must be a positive integer.' })
    }

    return {
      logs: dbService.listTaskLogs({
        since: parsedSince,
        taskExternalId: taskId?.trim() || undefined,
        limit: parsedLimit,
      }),
    }
  })

  fastify.get('/tasks/:taskId/diff/files', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    const project = config.projects.find((candidate) => candidate.id === task.projectId)
    if (!project) {
      return reply.status(404).send({ error: `Project ${task.projectId} not found in config` })
    }

    const liveWorktree = activeWorktrees.get(task.id)
    if (liveWorktree) {
      const files = await gitService.getWorktreeChangedFiles(liveWorktree)
      return { files }
    }

    if (!task.prNumber && !task.branchName) {
      return { files: [] as TaskDiffFile[] }
    }

    const unifiedDiff = await gitService.getTaskUnifiedDiff(project, task)
    const parsed = splitUnifiedDiffByFile(unifiedDiff)
    const files: TaskDiffFile[] = Array.from(parsed.entries()).map(([path, meta]) => ({
      path,
      status: meta.status,
    }))

    return { files }
  })

  fastify.get('/tasks/:taskId/diff', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const { file } = request.query as { file?: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    const project = config.projects.find((candidate) => candidate.id === task.projectId)
    if (!project) {
      return reply.status(404).send({ error: `Project ${task.projectId} not found in config` })
    }

    const liveWorktree = activeWorktrees.get(task.id)
    if (liveWorktree && file) {
      const patch = await gitService.getWorktreeFileDiff(liveWorktree, file)
      return { patch }
    }

    if (!task.prNumber && !task.branchName) {
      return { patch: '' }
    }

    const unifiedDiff = await gitService.getTaskUnifiedDiff(project, task)
    if (!file) {
      return { patch: unifiedDiff || '' }
    }

    const parsed = splitUnifiedDiffByFile(unifiedDiff)
    const selected = parsed.get(file)
    if (!selected) {
      return reply.status(404).send({ error: `Diff for file ${file} not found` })
    }

    return { patch: selected.patch, status: selected.status }
  })

  fastify.post('/tasks/:taskId/approve', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = request.body as { approver?: string; planMarkdown?: string }

    const task = dbService.getTaskByLookup(taskId)

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (!isPlanAwaitingApproval(normalizePlanState(task))) {
      return reply.status(409).send({ error: 'Task is not in a state where approval is required.' })
    }

    if (typeof body?.planMarkdown === 'string') {
      const trimmedPlan = body.planMarkdown.trim()
      if (!trimmedPlan) {
        return reply.status(400).send({ error: 'planMarkdown cannot be empty when provided.' })
      }

      dbService.updateTaskPlanOutput(task.id, { planMarkdown: trimmedPlan })
    }

    dbService.approveTaskPlan(task.id, body?.approver)
    setTaskQueued(task.id, 'Plan approved. Queued for execution.')

    return { ok: true }
  })

  fastify.post('/tasks/:taskId/reject', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = request.body as { reason?: string }

    const task = dbService.getTaskByLookup(taskId)

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (!isPlanAwaitingApproval(normalizePlanState(task))) {
      return reply
        .status(409)
        .send({ error: 'Task is not in a state where rejection is required.' })
    }

    dbService.rejectTaskPlan(task.id)
    dbService.updateTaskStatus(task.id, 'FAILED')
    dbService.updateTaskPlanOutput(task.id, {
      planResult: `Rejected by operator: ${body?.reason || 'No reason provided.'}`,
    })
    setTaskFailed(task.id, 'Plan rejected by operator.')

    return { ok: true }
  })

  fastify.post('/tasks/:taskId/retry', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = request.body as { mode?: RetryMode } | undefined
    const task = dbService.getTaskByLookup(taskId)

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (activeTasks.has(task.id)) {
      return reply.status(409).send({ error: 'Task is already running' })
    }

    let mode: RetryMode
    try {
      mode = parseRetryMode(body?.mode)
    } catch (error: any) {
      return reply.status(400).send({ error: error.message })
    }

    if (mode === 'execution') {
      let taskPlanState: TaskPlanState
      try {
        taskPlanState = normalizePlanState(task)
      } catch (error: any) {
        return reply.status(409).send({ error: error.message })
      }
      if (taskPlanState !== TaskPlanState.PLAN_APPROVED && taskPlanState !== TaskPlanState.NOT_REQUIRED) {
        return reply.status(409).send({
          error: 'Execution retry requires an approved plan. Use mode=full to regenerate plan.',
        })
      }
      dbService.updateTaskStatus(task.id, 'PENDING')
      dbService.resetExecutionAttempts(task.id)
    } else {
      dbService.updateTaskStatus(task.id, 'PENDING')
      dbService.resetTaskForFullRetry(task.id)
      dbService.clearTaskPullRequestInfo(task.id)
    }
    canceledTasks.delete(task.id)
    clearTaskState(task.id)
    setTaskQueued(
      task.id,
      mode === 'execution' ? 'Queued for manual execution retry' : 'Queued for manual full retry'
    )

    return { ok: true, mode }
  })

  fastify.post('/tasks/:taskId/cancel', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const task = dbService.getTaskByLookup(taskId)

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELED') {
      return reply.status(409).send({ error: 'Task is not cancellable' })
    }

    canceledTasks.add(task.id)
    dbService.updateTaskStatus(task.id, 'CANCELED')
    setTaskCanceled(
      task.id,
      activeTasks.has(task.id) ? 'Cancellation requested' : 'Task canceled'
    )

    return { ok: true }
  })

  const currentFilePath = fileURLToPath(import.meta.url)
  const orchestratorDistDir = path.dirname(currentFilePath)
  const bundledUiDist = path.resolve(orchestratorDistDir, '../../ui/dist')
  const workspaceUiDist = path.resolve(process.cwd(), '../ui/dist')
  const envUiDist = process.env.PARALLAX_UI_DIST
    ? path.resolve(process.env.PARALLAX_UI_DIST)
    : undefined
  const uiDistCandidates = [envUiDist, bundledUiDist, workspaceUiDist].filter(Boolean) as string[]
  const uiDistPath = uiDistCandidates.find((candidate) => fs.existsSync(candidate))

  if (uiDistPath) {
    fastify.get('/*', async (request, reply) => {
      const requestPath = (request.params as { '*': string })['*'] || ''
      const normalized = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath
      const decoded = decodeURIComponent(normalized)
      const resolved = path.resolve(uiDistPath, decoded || 'index.html')
      const uiRootResolved = path.resolve(uiDistPath)

      if (!resolved.startsWith(uiRootResolved)) {
        return reply.status(400).send({ error: 'Invalid path' })
      }

      const candidatePath = fs.existsSync(resolved) && fs.statSync(resolved).isFile()
        ? resolved
        : path.resolve(uiDistPath, 'index.html')

      try {
        const content = await fsPromises.readFile(candidatePath)
        return reply.type(inferMimeType(candidatePath)).send(content)
      } catch {
        return reply.status(404).send({ error: 'UI asset not found' })
      }
    })
  } else {
    logger.warn('UI dist not found. API will run without embedded dashboard.')
  }

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  const io = new SocketServer(fastify.server, { cors: { origin: '*' } })
  setIo(io)

  while (true) {
    try {
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
            dbService.updateTaskPlanState(
              dbService.getTaskByExternalId(task.externalId)!.id,
              TaskPlanState.PLAN_GENERATING
            )
            setTaskQueued(task.id, 'Queued for execution plan')
            logger.info(`New ticket discovered: ${task.externalId}`)
          }

          const pending = dbService
            .getPendingTasks()
            .filter((t) => t.projectId === project.id && !activeTasks.has(t.id))
          for (const task of pending) {
            if (canceledTasks.has(task.id) || task.status === 'CANCELED') {
              continue
            }

            let taskPlanState: TaskPlanState
            try {
              taskPlanState = normalizePlanState(task)
            } catch (error: any) {
              logger.error(
                `Skipping task with invalid plan state: ${error.message}`,
                task.id
              )
              dbService.updateTaskStatus(task.id, 'FAILED')
              setTaskFailed(task.id, `Invalid plan state: ${error.message}`)
              continue
            }

            if (isPlanAwaitingApproval(taskPlanState)) {
              setTaskQueued(task.id, deriveTaskMessage(task))
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
                await processTask(task, project, adapter, gitService, canceledTasks, services)
              } finally {
                canceledTasks.delete(task.id)
                activeTasks.delete(task.id)
              }
            })
          }

          if (services.githubPullRequestService) {
            const prs = await services.githubPullRequestService.listManagedPullRequests(project)
            for (const pr of prs) {
              const task = dbService.getTaskByPrNumber(project.id, pr.number)
              if (
                !task ||
                activeTasks.has(task.id) ||
                task.status === 'CANCELED' ||
                canceledTasks.has(task.id)
              ) {
                continue
              }

              const reviewContext = await services.githubPullRequestService.getReviewContext(
                project,
                pr,
                task.lastReviewEventAt
              )

              if (!reviewContext) {
                continue
              }

              activeTasks.add(task.id)
              dbService.updateTaskReviewState(task.id, 'REVIEW_PENDING')
              setTaskQueued(task.id, 'Queued for PR review follow-up')
              limit(async () => {
                try {
                  if (canceledTasks.has(task.id)) {
                    return
                  }
                  await processPullRequestReview(
                    task,
                    project,
                    reviewContext,
                    adapter,
                    gitService,
                    canceledTasks
                  )
                } finally {
                  canceledTasks.delete(task.id)
                  activeTasks.delete(task.id)
                }
              })
            }
          }
        } catch (projectError: any) {
          logger.error(`Project poll error (${project.id}): ${projectError.message}`)
        }
      }
    } catch (e: any) {
      logger.error(`Poll Error: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 15000))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
