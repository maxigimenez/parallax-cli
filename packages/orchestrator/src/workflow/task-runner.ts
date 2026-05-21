import path from 'path'
import os from 'os'
import {
  TASK_LOG_KIND,
  TASK_LOG_LEVEL,
  TASK_LOG_SOURCE,
  AGENT_PROVIDER,
  AppConfig,
  PlanResult,
  PlanResultStatus,
  ProjectConfig,
  Task,
  TaskPlanState,
  TASK_STATUS,
  TASK_REVIEW_STATE,
} from '@parallax/common'
import {
  BaseAgentAdapter,
  ClaudeCodeAdapter,
  CodexAdapter,
  GeminiAdapter,
} from '../ai-adapters/index.js'
import { HostExecutor } from '@parallax/common/executor'
import { GitService } from '../git-service.js'
import {
  formatPullRequestReviewComments,
  GitHubReviewService,
  type PullRequestReviewComment,
} from '../github/review-service.js'
import { logger } from '../logger.js'
import { dbService } from '../database.js'
import { taskLifecycle } from '../task-lifecycle.js'
import { ExternalServices, markTaskInProgress } from '../runtime/provider-services.js'
import { getSlackBot } from '../slack-integration.js'
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
    return new ClaudeCodeAdapter(executor, currentLog)
  }

  throw new Error(`Agent provider "${provider}" is not supported.`)
}

export async function processTaskPlan(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: ExternalServices,
  config?: AppConfig
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

    if (planResult.sessionId) {
      dbService.updateAgentSessionId(task.id, planResult.sessionId)
    }

    await persistPlanResult(task, project, planResult, config)
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

async function persistPlanResult(
  task: Task,
  project: ProjectConfig,
  planResult: PlanResult,
  config?: AppConfig
) {
  const nextState = getNextPlanState(planResult.status as PlanResultStatus)
  dbService.updateTaskPlanOutput(task.id, {
    planState: nextState,
    planMarkdown: planResult.planMarkdown ?? null,
    planPrompt: assertPlanPrompt(planResult.planPrompt, task.id),
    planResult: planResult.output,
    lastAgent: project.agent.name ?? project.agent.provider,
  })

  if (nextState === TaskPlanState.PLAN_READY) {
    taskLifecycle.queue(task.id, 'Plan ready. Awaiting approval.')
    const updatedTask = dbService.getTaskById(task.id)
    if (updatedTask) {
      const agentDef = config?.agents.find((a) => a.name === (project.agent.name ?? task.agentName))
      getSlackBot()
        ?.notify({ task: updatedTask, event: 'plan_ready', agentDef })
        .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
    }
    return
  }
  if (nextState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION) {
    taskLifecycle.queue(task.id, 'Plan needs clarification. Please review before approval.')
    return
  }

  const failMessage = planResult.error ?? 'Plan generation failed'
  taskLifecycle.fail(task.id, failMessage)
  const failedTask = dbService.getTaskById(task.id)
  if (failedTask) {
    const agentDef = config?.agents.find((a) => a.name === (project.agent.name ?? task.agentName))
    getSlackBot()
      ?.notify({ task: failedTask, event: 'failed', agentDef, extra: failMessage })
      .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
  }
}

export async function processTask(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  canceledTasks: Set<string>,
  services: ExternalServices,
  activeWorktrees: Map<string, string>,
  config?: AppConfig
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

    if (result.sessionId) {
      dbService.updateAgentSessionId(task.id, result.sessionId)
    }

    const agentDef = config?.agents.find((a) => a.name === (project.agent.name ?? task.agentName))

    if (result.success) {
      await emitWorktreeDiffLogs(task, gitService, worktreePath)
      const branchName = await gitService.commitAndPush(worktreePath, task)
      if (!branchName) {
        logger.error('No changes made by agent.', task.id)
        taskLifecycle.fail(task.id, 'No changes made by agent.')
        getSlackBot()
          ?.notify({ task, event: 'failed', agentDef, extra: 'No changes made by agent.' })
          .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
        return
      }

      const prUrl = await gitService.createPullRequest(worktreePath, task, {
        prTitle: result.prTitle,
        prSummary: result.prSummary,
        head: branchName,
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
        lastAgent: project.agent.name ?? project.agent.provider,
      })
      const completedTask = dbService.getTaskById(task.id)
      if (completedTask) {
        getSlackBot()
          ?.notify({ task: completedTask, event: 'pr_created', agentDef, extra: prUrl })
          .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
      }
      return
    }

    if (isPlaceholderPlanError(result.error)) {
      dbService.updateTaskPlanOutput(task.id, {
        planState: TaskPlanState.PLAN_REQUIRES_CLARIFICATION,
        planResult: result.error,
        planPrompt: getTaskPlanPrompt(task),
        lastAgent: project.agent.name ?? project.agent.provider,
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
    getSlackBot()
      ?.notify({ task, event: 'failed', agentDef, extra: result.error })
      .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      taskLifecycle.cancel(task.id, 'Task canceled before completion.')
      logger.warn('Task canceled before completion.', task.id)
      return
    }

    const criticalMsg = `Critical error: ${error.message}`
    logger.error(criticalMsg, task.id)
    taskLifecycle.fail(task.id, criticalMsg)
    const failedTask = dbService.getTaskById(task.id)
    if (failedTask) {
      const agentDef = config?.agents.find((a) => a.name === (project.agent.name ?? task.agentName))
      getSlackBot()
        ?.notify({ task: failedTask, event: 'failed', agentDef, extra: error.message })
        .catch((err: any) => logger.error(`Slack notify failed: ${err?.message ?? err}`, task.id))
    }
  } finally {
    activeWorktrees.delete(task.id)
    if (worktreePath) {
      await gitService.removeWorktree(worktreePath, project.workspaceDir)
    }
  }
}

function buildPullRequestReviewDescription(
  task: Task,
  prNumber: number,
  comments: PullRequestReviewComment[]
) {
  const commentsBlock = formatPullRequestReviewComments(comments)

  return [
    `Original Task: ${task.title}`,
    '',
    'Goal:',
    `Address the requested review changes on PR #${prNumber} by updating the existing branch only.`,
    '',
    'Original Task Description:',
    task.description || 'No original task description provided.',
    '',
    'Open Review Comments:',
    commentsBlock,
  ].join('\n')
}

function buildPullRequestReviewPlan(comments: PullRequestReviewComment[]) {
  return [
    'Apply only the requested review changes listed below.',
    'Use the referenced files and lines as the primary scope.',
    'Do not expand scope beyond satisfying these comments.',
    'Keep the existing PR branch intact and prepare the changes to be pushed back to the same PR.',
    '',
    formatPullRequestReviewComments(comments),
  ].join('\n')
}

export async function processPullRequestReview(
  task: Task,
  project: ProjectConfig,
  adapter: BaseAgentAdapter,
  gitService: GitService,
  reviewService: GitHubReviewService,
  comments: PullRequestReviewComment[],
  canceledTasks: Set<string>,
  activeWorktrees: Map<string, string>
) {
  if (!task.prNumber) {
    throw new Error(`Task ${task.id} does not have an attached PR number.`)
  }

  const prNumber = task.prNumber
  logger.warn(`[experimental] Starting PR review run for PR #${prNumber}`, task.id)
  dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.APPLYING_REVIEW)
  dbService.updateTaskStatus(task.id, TASK_STATUS.IN_PROGRESS)
  dbService.updateTaskReviewEventAt(task.id, new Date().toISOString())
  taskLifecycle.run(task.id, `Applying PR review comments for #${prNumber}`)

  let worktreePath: string | undefined

  try {
    throwIfCancellationRequested(task.id, canceledTasks)
    if (!task.branchName) {
      throw new Error(`Task ${task.id} is missing a PR branch for review application.`)
    }

    const tempBaseDir = resolveWorktreeBaseDir()
    worktreePath = await gitService.createWorktreeForExistingBranch(task, project, tempBaseDir)
    activeWorktrees.set(task.id, worktreePath)

    logger.info(`Review worktree created: ${worktreePath}`, task.id)
    logger.info(`Applying ${comments.length} open human review comment(s).`, task.id)

    const reviewTask: Task = {
      ...task,
      title: `PR Review: ${task.title}`,
      description: buildPullRequestReviewDescription(task, prNumber, comments),
    }

    throwIfCancellationRequested(task.id, canceledTasks)
    const result = await adapter.runTask(
      reviewTask,
      worktreePath,
      project,
      buildPullRequestReviewPlan(comments),
      'commit'
    )
    throwIfCancellationRequested(task.id, canceledTasks)

    if (!result.success) {
      logger.error(`PR review run failed: ${result.error}`, task.id)
      dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.NONE)
      taskLifecycle.fail(task.id, `PR review run failed: ${result.error}`)
      return
    }

    await emitWorktreeDiffLogs(task, gitService, worktreePath)
    const branchName = await gitService.commitAndPush(worktreePath, task, {
      commitMessage: result.commitMessage,
    })
    if (!branchName) {
      dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.NONE)
      logger.error('No changes made while applying PR review comments.', task.id)
      taskLifecycle.fail(task.id, 'No changes made while applying PR review comments.')
      return
    }

    dbService.updateTaskPullRequestInfo(task.id, {
      branchName,
      prUrl: task.prUrl!,
      prNumber,
    })
    dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.REVISION_PUSHED)
    dbService.updateTaskReviewEventAt(task.id, new Date().toISOString())
    logger.success(`Review updates pushed to PR #${prNumber}`, task.id)

    try {
      await reviewService.resolveReviewThreads(
        project,
        comments.map((comment) => comment.threadId)
      )
      logger.success(
        `Resolved ${new Set(comments.map((comment) => comment.threadId)).size} review thread(s).`,
        task.id
      )
    } catch (error: any) {
      logger.warn(`Pushed changes but could not resolve review threads: ${error.message}`, task.id)
    }

    taskLifecycle.complete(task.id, `Review updates pushed to PR #${prNumber}`)
  } catch (error: any) {
    if (error instanceof TaskCanceledError) {
      dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.NONE)
      taskLifecycle.cancel(task.id, 'PR review run canceled')
      logger.warn('PR review run canceled.', task.id)
      return
    }

    dbService.updateTaskReviewState(task.id, TASK_REVIEW_STATE.NONE)
    logger.error(`PR review critical error: ${error.message}`, task.id)
    taskLifecycle.fail(task.id, `PR review critical error: ${error.message}`)
  } finally {
    activeWorktrees.delete(task.id)
    if (worktreePath) {
      await gitService.removeWorktree(worktreePath, project.workspaceDir)
    }
  }
}

async function emitWorktreeDiffLogs(task: Task, gitService: GitService, worktreePath: string) {
  const changedFiles = await gitService.getWorktreeChangedFiles(worktreePath)
  for (const changedFile of changedFiles) {
    const diff = await gitService.getWorktreeFileDiff(worktreePath, changedFile.path)
    logger.event({
      taskId: task.id,
      title: changedFile.path,
      message: diff || `${changedFile.status} ${changedFile.path}`,
      kind: TASK_LOG_KIND.FILE_CHANGE,
      level: TASK_LOG_LEVEL.INFO,
      source: TASK_LOG_SOURCE.GIT,
    })
  }
}

export { isTaskExecutable, normalizePlanState, requiresPlan }
