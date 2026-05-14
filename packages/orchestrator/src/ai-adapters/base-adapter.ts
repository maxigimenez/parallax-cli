import fs from 'node:fs/promises'
import dotenv from 'dotenv'
import { Task, Logger, ProjectConfig, AgentResult, PlanResult } from '@parallax/common'
import { LocalExecutor } from '@parallax/common/executor'
import { readAgentMemory } from './agent-memory.js'

export abstract class BaseAgentAdapter {
  private envFileCache = new Map<string, Record<string, string>>()

  constructor(
    protected executor: LocalExecutor,
    protected logger: Logger
  ) {}

  async setupWorkspace(task: Task, workingDir: string): Promise<void> {
    this.logger.info(`Workspace already prepared via git worktree: ${workingDir}`, task.id)
  }

  protected async buildContextPrefix(project: ProjectConfig, task: Task): Promise<string> {
    const parts: string[] = []

    if (project.agent.systemPrompt) {
      parts.push(project.agent.systemPrompt)
    }

    if (project.agent.name) {
      const memory = await readAgentMemory(project.agent.name)
      if (memory) {
        parts.push(`## Agent Memory\n${memory}`)
      }
    }

    return parts.join('\n\n')
  }

  protected async resolveProjectEnv(
    project: ProjectConfig
  ): Promise<Record<string, string> | undefined> {
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
    approvedPlan?: string,
    outputMode?: 'pr' | 'commit'
  ): Promise<AgentResult>

  abstract runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult>
}
