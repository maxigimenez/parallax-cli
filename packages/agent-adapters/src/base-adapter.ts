import {
  Task,
  Logger,
  ProjectConfig,
  AgentResult,
  LocalExecutor,
  PlanResult,
} from '@parallax/common'

export abstract class BaseAgentAdapter {
  constructor(
    protected executor: LocalExecutor,
    protected logger: Logger
  ) {}

  async setupWorkspace(task: Task, workingDir: string): Promise<void> {
    this.logger.info(`Workspace already prepared via git worktree: ${workingDir}`, task.externalId)
  }

  abstract runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string
  ): Promise<AgentResult>

  abstract runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult>

  abstract runReviewFixPass(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    review: { prUrl: string; branchName: string; baseBranch: string; feedback: string }
  ): Promise<AgentResult>

  abstract runMergeConflictResolution(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    review: { prUrl: string; branchName: string; baseBranch: string }
  ): Promise<AgentResult>
}
