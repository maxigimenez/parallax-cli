import { PULL_PROVIDER, TASK_STATUS, Task, ProjectConfig } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { createTaskId } from '../task-id.js'
import { parseGitHubIssueNumber, requireGitHubRepoDetails } from './repository.js'

interface GitHubIssueSummary {
  number: number
  title: string
  body?: string | null
}

export class GitHubService {
  constructor(private executor: HostExecutor) {}

  private buildIssueListCommand(project: ProjectConfig): string[] {
    const { owner, repo } = requireGitHubRepoDetails(project)
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
    if (project.pullFrom.provider !== PULL_PROVIDER.GITHUB) {
      return []
    }

    const { owner, repo } = requireGitHubRepoDetails(project)
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
      id: createTaskId(project.id, `${owner}/${repo}#${issue.number}`),
      externalId: `${owner}/${repo}#${issue.number}`,
      title: issue.title,
      description: issue.body ?? '',
      status: TASK_STATUS.PENDING,
      projectId: project.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
  }

  async markAsInProgress(externalId: string, project: ProjectConfig) {
    if (project.pullFrom.provider !== PULL_PROVIDER.GITHUB) {
      return
    }

    const { owner, repo } = requireGitHubRepoDetails(project)
    const issueNumber = parseGitHubIssueNumber(externalId)
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
