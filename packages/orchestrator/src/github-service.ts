import { Task, ProjectConfig, HostExecutor } from '@parallax/common'
import { createTaskId } from './task-id.js'

interface GitHubIssueSummary {
  number: number
  title: string
  body?: string | null
}

export class GitHubService {
  constructor(private executor: HostExecutor) {}

  private getRepoDetails(project: ProjectConfig) {
    const { owner, repo } = project.pullFrom.filters

    if (!owner || !repo) {
      throw new Error(
        `GitHub provider for project "${project.id}" requires pullFrom.filters.owner and pullFrom.filters.repo`
      )
    }

    return { owner, repo }
  }

  private getIssueNumber(externalId: string): number {
    const match = externalId.match(/#(\d+)$/)
    if (!match) {
      throw new Error(`Unable to parse GitHub issue number from external ID "${externalId}"`)
    }

    return Number.parseInt(match[1], 10)
  }

  private buildIssueListCommand(project: ProjectConfig): string[] {
    const { owner, repo } = this.getRepoDetails(project)
    const { state = 'open', labels } = project.pullFrom.filters

    const command = [
      'gh',
      'issue',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--json',
      'number,title,body',
      '--limit',
      '100',
    ]

    if (state) {
      command.push('--state', state)
    }

    if (labels?.length) {
      for (const label of labels) {
        command.push('--label', label)
      }
    }

    return command
  }

  async fetchNewIssues(project: ProjectConfig): Promise<Task[]> {
    if (project.pullFrom.provider !== 'github') {
      return []
    }

    const { owner, repo } = this.getRepoDetails(project)
    const result = await this.executor.executeCommand(this.buildIssueListCommand(project), {
      cwd: project.workspaceDir,
    })

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while listing issues: ${result.output}`)
    }

    const issues = JSON.parse(result.output || '[]') as GitHubIssueSummary[]

    return issues.map((issue) => ({
      id: createTaskId(),
      externalId: `${owner}/${repo}#${issue.number}`,
      title: issue.title,
      description: issue.body || '',
      status: 'PENDING',
      projectId: project.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
  }

  async markAsInProgress(externalId: string, project: ProjectConfig) {
    if (project.pullFrom.provider !== 'github') {
      return
    }

    const { owner, repo } = this.getRepoDetails(project)
    const issueNumber = this.getIssueNumber(externalId)
    const result = await this.executor.executeCommand(
      [
        'gh',
        'issue',
        'comment',
        String(issueNumber),
        '--repo',
        `${owner}/${repo}`,
        '--body',
        'Parallax has started working on this task in the local host environment.',
      ],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while commenting on issue: ${result.output}`)
    }
  }
}
