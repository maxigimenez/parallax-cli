import path from 'path'
import os from 'os'
import {
  AGENT_PROVIDER,
  PlanResult,
  PlanResultStatus,
  ProjectConfig,
  Task,
  TaskPlanState,
} from '@parallax/common'
import { BaseAgentAdapter, CodexAdapter, GeminiAdapter } from '../ai-adapters/index.js'
import { HostExecutor } from '@parallax/common/executor'
import { GitService } from '../git-service.js'
import { logger } from '../logger.js'
import { dbService } from '../database.js'
import { taskLifecycle } from '../task-lifecycle.js'
import { ExternalServices, markTaskInProgress } from '../runtime/provider-services.js'
import {
  assertPlanPrompt,
  getNextPlanState,
  getTaskPlanPrompt,
  isPlaceholderPlanError,
  isRetryableExecution,
  isTaskExecutable,
  normalizePlanState,
  requiresPlan,
  TaskCanceledError,
  throwIfCancellationRequested,
} from './task-state.js'

export const MAX_EXECUTION_ATTEMPTS = 2

function resolveWorktreeBaseDir() {
  const dataDir = process.env.PARALLAX_DATA_DIR
    ? path.resolve(process.env.PARALLAX_DATA_DIR)
    : path.join(os.homedir(), '.parallax')

  return path.join(dataDir, 'worktrees')
}

export function createAgentAdapter(
  project: ProjectConfig,
  executor: HostExecutor,
  currentLog: typeof logger
): BaseAgentAdapter {
  const provider = project.agent.provider

  if (provider === AGENT_PROVIDER.CODEX) {
    return new CodexAdapter(executor, currentLog)
  }
  if (provider === AGENT_PROVIDER.GEMINI) {
    return new GeminiAdapter(executor, currentLog)
  }
  if (provider === AGENT_PROVIDER.CLAUDE_CODE) {
    throw new Error('Agent provider "claude-code" is not implemented yet.')
  }

  throw new Error(`Agent provider "${provider}" is not supported.`)
}

export async function processTaskPlan(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: ExternalServices
) {
  logger.info(`Starting plan generation: ${task.title}`, task.id)
  dbService.updateTaskPlanState(task.id, TaskPlanState.PLAN_GENERATING)
  taskLifecycle.run(task.id, 'Generating plan')

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    await markTaskInProgress(task, project, services)
    throwIfCancellationRequested(task.id, canceledTasks)

    const tempBaseDir = resolveWorktreeBaseDir()
    const worktreePath = await gitService.createWorktree(task, project, tempBaseDir)

    logger.info(`Plan worktree created: ${worktreePath}`, task.id)
    const planResult = await adapter.runPlan(task, worktreePath, project)
    throwIfCancellationRequested(task.id, canceledTasks)

    await persistPlanResult(task, project, planResult)
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      taskLifecycle.cancel(task.id, 'Plan generation canceled')
      return
    }

    logger.error(`Plan generation critical error: ${error.message}`, task.id)
    taskLifecycle.fail(
      task.id,
      `Critical error while generating plan: ${error.message}`,
      TaskPlanState.PLAN_FAILED
    )
  } finally {
    if (task.externalId) {
      try {
        await gitService.removeWorktree(
          path.join(resolveWorktreeBaseDir(), task.externalId),
          project.workspaceDir
        )
      } catch {
        // Best effort cleanup.
      }
    }
  }
}

async function persistPlanResult(task: Task, project: ProjectConfig, planResult: PlanResult) {
  const nextState = getNextPlanState(planResult.status as PlanResultStatus)
  dbService.updateTaskPlanOutput(task.id, {
    planState: nextState,
    planMarkdown: planResult.planMarkdown ?? null,
    planPrompt: assertPlanPrompt(planResult.planPrompt, task.id),
    planResult: planResult.output,
    lastAgent: project.agent.provider,
  })

  if (nextState === TaskPlanState.PLAN_READY) {
    taskLifecycle.queue(task.id, 'Plan ready. Awaiting approval.')
    return
  }
  if (nextState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION) {
    taskLifecycle.queue(task.id, 'Plan needs clarification. Please review before approval.')
    return
  }

  taskLifecycle.fail(task.id, planResult.error ?? 'Plan generation failed')
}

export async function processTask(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: ExternalServices,
  activeWorktrees: Map<string, string>
) {
  logger.info(`Starting process: ${task.title}`, task.id)

  if (!isTaskExecutable(task)) {
    logger.warn('Skipping execution due to incomplete plan state.', task.id)
    return
  }
  if (!isRetryableExecution(task, MAX_EXECUTION_ATTEMPTS)) {
    logger.warn('Execution attempt limit reached. Skipping task.', task.id)
    taskLifecycle.fail(task.id, 'Execution attempt limit reached.')
    return
  }

  taskLifecycle.run(task.id, `Starting execution: ${task.title}`)
  dbService.incrementExecutionAttempts(task.id)
  let worktreePath: string | undefined

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    await markTaskInProgress(task, project, services)
    throwIfCancellationRequested(task.id, canceledTasks)

    const tempBaseDir = resolveWorktreeBaseDir()
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
        logger.error('No changes made by agent.', task.id)
        taskLifecycle.fail(task.id, 'No changes made by agent.')
        return
      }

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
      taskLifecycle.complete(task.id, `PR Created: ${prUrl}`)
      dbService.updateTaskPlanOutput(task.id, {
        planState: TaskPlanState.PLAN_APPROVED,
        planPrompt: getTaskPlanPrompt(task),
        lastAgent: project.agent.provider,
      })
      return
    }

    if (isPlaceholderPlanError(result.error)) {
      dbService.updateTaskPlanOutput(task.id, {
        planState: TaskPlanState.PLAN_REQUIRES_CLARIFICATION,
        planResult: result.error,
        planPrompt: getTaskPlanPrompt(task),
        lastAgent: project.agent.provider,
      })
      taskLifecycle.queue(
        task.id,
        'Plan requires clarification. Please provide concrete approved steps.'
      )
      logger.warn(`Execution blocked: ${result.error}`, task.id)
      return
    }

    logger.error(`Agent failed: ${result.error}`, task.id)
    taskLifecycle.fail(task.id, `Agent failed: ${result.error}`)
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      taskLifecycle.cancel(task.id, 'Task canceled before completion.')
      logger.warn('Task canceled before completion.', task.id)
      return
    }

    logger.error(`Critical error: ${error.message}`, task.id)
    taskLifecycle.fail(task.id, `Critical error: ${error.message}`)
  } finally {
    activeWorktrees.delete(task.id)
    if (worktreePath) {
      await gitService.removeWorktree(worktreePath, project.workspaceDir)
    }
  }
}

export {
  isTaskExecutable,
  normalizePlanState,
  requiresPlan,
}
