import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { AppConfig, TASK_STATUS, TaskPlanState } from '@parallax/common'
import { dbService } from '../database.js'
import { clearTaskState } from '../logger.js'
import { GitService } from '../git-service.js'
import { taskLifecycle } from '../task-lifecycle.js'
import { isPlanAwaitingApproval, normalizePlanState } from '../workflow/task-state.js'
import { splitUnifiedDiffByFile } from './api/diff-utils.js'
import {
  parseNonNegativeInteger,
  parseOptionalTaskId,
  parsePositiveInteger,
  parseRetryMode,
  type RetryMode,
} from './api/request-parsers.js'
import { serializeTaskForApi } from './api/task-response.js'

type TaskDiffFile = {
  path: string
  status: 'A' | 'M' | 'D' | 'R'
}

type ApiServerDependencies = {
  config: AppConfig
  gitService: GitService
  activeTasks: Set<string>
  canceledTasks: Set<string>
  activeWorktrees: Map<string, string>
}

function resolveTaskProject(config: AppConfig, projectId: string) {
  const project = config.projects.find((candidate) => candidate.id === projectId)
  if (!project) {
    throw new Error(`Project ${projectId} not found in config`)
  }

  return project
}

function isTerminalTaskStatus(status: string) {
  return (
    status === TASK_STATUS.COMPLETED ||
    status === TASK_STATUS.FAILED ||
    status === TASK_STATUS.CANCELED
  )
}

export async function createApiServer(
  dependencies: ApiServerDependencies
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })
  const { config, gitService, activeTasks, canceledTasks, activeWorktrees } = dependencies

  await fastify.register(cors, { origin: '*' })

  fastify.get('/tasks', async () => dbService.listTasks().map((task) => serializeTaskForApi(task)))

  fastify.get('/tasks/pending-plans', async () =>
    dbService
      .listTasks()
      .filter(
        (task) =>
          task.status === TASK_STATUS.PENDING && isPlanAwaitingApproval(normalizePlanState(task))
      )
      .map((task) => serializeTaskForApi(task))
  )

  fastify.get('/config', async () => config)

  fastify.get('/logs', async (request, reply) => {
    const { since, taskId, limit } = request.query as {
      since?: string
      taskId?: string
      limit?: string
    }

    try {
      return {
        logs: dbService.listTaskLogs({
          since: parseNonNegativeInteger(since, 'since', 0),
          taskExternalId: parseOptionalTaskId(taskId),
          limit: parsePositiveInteger(limit, 'limit', 200),
        }),
      }
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  fastify.get('/tasks/:taskId/diff/files', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    let project
    try {
      project = resolveTaskProject(config, task.projectId)
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) })
    }

    const liveWorktree = activeWorktrees.get(task.id)
    if (liveWorktree) {
      return { files: await gitService.getWorktreeChangedFiles(liveWorktree) }
    }

    if (!task.prNumber && !task.branchName) {
      return { files: [] as TaskDiffFile[] }
    }

    const parsed = splitUnifiedDiffByFile(await gitService.getTaskUnifiedDiff(project, task))
    return {
      files: Array.from(parsed.entries()).map(([path, meta]) => ({
        path,
        status: meta.status,
      })),
    }
  })

  fastify.get('/tasks/:taskId/diff', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const { file } = request.query as { file?: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    let project
    try {
      project = resolveTaskProject(config, task.projectId)
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) })
    }

    const liveWorktree = activeWorktrees.get(task.id)
    if (liveWorktree && file) {
      return { patch: await gitService.getWorktreeFileDiff(liveWorktree, file) }
    }

    if (!task.prNumber && !task.branchName) {
      return { patch: '' }
    }

    const unifiedDiff = await gitService.getTaskUnifiedDiff(project, task)
    if (!file) {
      return { patch: unifiedDiff }
    }

    const selected = splitUnifiedDiffByFile(unifiedDiff).get(file)
    if (!selected) {
      return reply.status(404).send({ error: `Diff for file ${file} not found` })
    }

    return { patch: selected.patch, status: selected.status }
  })

  fastify.post('/tasks/:taskId/approve', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const { approver, planMarkdown } = (request.body ?? {}) as {
      approver?: string
      planMarkdown?: string
    }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (!isPlanAwaitingApproval(normalizePlanState(task))) {
      return reply.status(409).send({ error: 'Task is not awaiting plan approval.' })
    }

    if (planMarkdown !== undefined) {
      const trimmed = planMarkdown.trim()
      if (!trimmed) {
        return reply.status(400).send({ error: 'planMarkdown cannot be empty when provided.' })
      }

      dbService.updateTaskPlanOutput(task.id, { planMarkdown: trimmed })
    }

    dbService.approveTaskPlan(task.id, approver)
    taskLifecycle.queue(task.id, 'Plan approved. Queued for execution.')
    return { ok: true }
  })

  fastify.post('/tasks/:taskId/reject', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const { reason } = (request.body ?? {}) as { reason?: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (!isPlanAwaitingApproval(normalizePlanState(task))) {
      return reply.status(409).send({ error: 'Task is not awaiting plan approval.' })
    }

    if (!reason?.trim()) {
      return reply.status(400).send({ error: 'Reject reason is required.' })
    }

    dbService.rejectTaskPlan(task.id)
    dbService.updateTaskPlanOutput(task.id, {
      planState: TaskPlanState.PLAN_REJECTED,
      planResult: `Rejected by operator: ${reason.trim()}`,
    })
    taskLifecycle.fail(task.id, 'Plan rejected by operator.', TaskPlanState.PLAN_REJECTED)
    return { ok: true }
  })

  fastify.post('/tasks/:taskId/retry', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const { mode: rawMode } = (request.body ?? {}) as { mode?: string }
    const task = dbService.getTaskByLookup(taskId)
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    if (activeTasks.has(task.id)) {
      return reply.status(409).send({ error: 'Task is already running.' })
    }

    let mode: RetryMode
    try {
      mode = parseRetryMode(rawMode)
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) })
    }

    if (mode === 'execution') {
      const planState = normalizePlanState(task)
      if (planState !== TaskPlanState.PLAN_APPROVED && planState !== TaskPlanState.NOT_REQUIRED) {
        return reply.status(409).send({
          error: 'Execution retry requires an approved plan. Use mode=full to regenerate plan.',
        })
      }

      dbService.resetExecutionAttempts(task.id)
    } else {
      dbService.resetTaskForFullRetry(task.id)
      dbService.clearTaskPullRequestInfo(task.id)
    }

    dbService.updateTaskStatus(task.id, TASK_STATUS.PENDING)
    canceledTasks.delete(task.id)
    clearTaskState(task.id)
    taskLifecycle.queue(
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

    if (isTerminalTaskStatus(task.status)) {
      return reply.status(409).send({ error: 'Task is not cancellable.' })
    }

    canceledTasks.add(task.id)
    taskLifecycle.cancel(
      task.id,
      activeTasks.has(task.id) ? 'Cancellation requested' : 'Task canceled'
    )
    return { ok: true }
  })

  return fastify
}
