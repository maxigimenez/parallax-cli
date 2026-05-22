import { Task, Logger, ProjectConfig, AgentResult, PlanResult } from '@parallax/common'
import { LocalExecutor } from '@parallax/common/executor'

export abstract class BaseAgentAdapter {
  constructor(
    protected executor: LocalExecutor,
    protected logger: Logger
  ) {}

  async setupWorkspace(task: Task, workingDir: string): Promise<void> {
    this.logger.info(`Workspace already prepared via git worktree: ${workingDir}`, task.id)
  }

  protected buildContextPrefix(project: ProjectConfig, _task: Task): string {
    return project.agent.systemPrompt ?? ''
  }

  abstract runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string,
    outputMode?: 'pr' | 'commit'
  ): Promise<AgentResult>

  abstract runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult>
}
