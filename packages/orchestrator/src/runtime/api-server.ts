import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { AppConfig, Task, TaskPlanState } from '@parallax/common'
import { dbService } from '../database.js'
import { clearTaskState, getTaskLogs, getTaskStatuses } from '../logger.js'
import { GitService } from '../git-service.js'
import { taskLifecycle } from '../task-lifecycle.js'
import { deriveTaskMessage, isPlanAwaitingApproval, normalizePlanState } from '../workflow/task-state.js'

type TaskDiffFile = {
  path: string
  status: 'A' | 'M' | 'D' | 'R'
}

type RetryMode = 'full' | 'execution'

type ApiServerDependencies = {
  config: AppConfig
  gitService: GitService
  activeTasks: Set<string>
  canceledTasks: Set<string>
  activeWorktrees: Map<string, string>
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

function normalizeTaskForApi(task: Task): Task {
  return {
    ...task,
    planState: normalizePlanState(task),
    executionAttempts: task.executionAttempts || 0,
  }
}

function parseRetryMode(value: string | undefined): RetryMode {
  if (!value) {
    return 'full'
  }

  if (value === 'full' || value === 'execution') {
    return value
  }

  throw new Error(`Invalid retry mode '${value}'. Use 'full' or 'execution'.`)
}

export async function createApiServer(
  dependencies: ApiServerDependencies
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })
  const { config, gitService, activeTasks, canceledTasks, activeWorktrees } = dependencies

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
    taskLifecycle.queue(task.id, 'Plan approved. Queued for execution.')

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
    dbService.updateTaskPlanOutput(task.id, {
      planResult: `Rejected by operator: ${body?.reason || 'No reason provided.'}`,
    })
    taskLifecycle.fail(task.id, 'Plan rejected by operator.')

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
      if (
        taskPlanState !== TaskPlanState.PLAN_APPROVED &&
        taskPlanState !== TaskPlanState.NOT_REQUIRED
      ) {
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

    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELED') {
      return reply.status(409).send({ error: 'Task is not cancellable' })
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
