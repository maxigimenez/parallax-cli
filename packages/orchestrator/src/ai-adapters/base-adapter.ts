import fs from 'node:fs/promises'
import dotenv from 'dotenv'
import {
  Task,
  Logger,
  ProjectConfig,
  AgentResult,
  PlanResult,
} from '@parallax/common'
import { LocalExecutor } from '@parallax/common/executor'

export abstract class BaseAgentAdapter {
  private envFileCache = new Map<string, Record<string, string>>()

  constructor(
    protected executor: LocalExecutor,
    protected logger: Logger
  ) {}

  async setupWorkspace(task: Task, workingDir: string): Promise<void> {
    this.logger.info(`Workspace already prepared via git worktree: ${workingDir}`, task.id)
  }

  protected async resolveProjectEnv(project: ProjectConfig): Promise<Record<string, string> | undefined> {
    if (!project.envFilePath) {
      return undefined
    }

    const cached = this.envFileCache.get(project.envFilePath)
    if (cached) {
      return cached
    }

    const content = await fs.readFile(project.envFilePath, 'utf8')
    const parsed = dotenv.parse(content)
    this.envFileCache.set(project.envFilePath, parsed)
    return parsed
  }

  abstract runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string
  ): Promise<AgentResult>

  abstract runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult>
}
