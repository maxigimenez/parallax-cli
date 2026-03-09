import {
  Task,
  Logger,
  ProjectConfig,
  AgentResult,
  PlanResult,
} from '@parallax/common'
import { LocalExecutor } from '@parallax/common/executor'

export abstract class BaseAgentAdapter {
  constructor(
    protected executor: LocalExecutor,
    protected logger: Logger
  ) {}

  async setupWorkspace(task: Task, workingDir: string): Promise<void> {
    this.logger.info(`Workspace already prepared via git worktree: ${workingDir}`, task.id)
  }

  abstract runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string
  ): Promise<AgentResult>

  abstract runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult>
}
