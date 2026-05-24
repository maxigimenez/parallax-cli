import { PULL_PROVIDER, TASK_STATUS, Task, ProjectConfig } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { createTaskId } from '../task-id.js'
import { parseGitHubIssueNumber, requireGitHubRepoDetails } from './repository.js'

export type TaskWithLabels = Task & { labels: string[] }

interface GitHubIssueSummary {
  number: number
  title: string
  body?: string | null
  labels?: Array<{ name: string }>
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
      'number,title,body,labels',
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

  async fetchNewIssues(project: ProjectConfig): Promise<TaskWithLabels[]> {
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
      labels: issue.labels?.map((l) => l.name) ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
  }

  async markAsInProgress(
    externalId: string,
    project: ProjectConfig,
    existingCommentId?: string | null,
    body?: string
  ): Promise<string | undefined> {
    if (project.pullFrom.provider !== PULL_PROVIDER.GITHUB) {
      return
    }

    const { owner, repo } = requireGitHubRepoDetails(project)
    const issueNumber = parseGitHubIssueNumber(externalId)
    const commentBody = body ?? '🤖 Parallax has picked up this task and is generating a plan.'

    await this.assignIssue(issueNumber, owner, repo, project)

    if (existingCommentId) {
      await this.updateComment(owner, repo, existingCommentId, commentBody, project)
      return existingCommentId
    }

    return this.postComment(issueNumber, owner, repo, commentBody, project)
  }

  async updateComment(
    owner: string,
    repo: string,
    commentId: string,
    body: string,
    project: ProjectConfig
  ): Promise<void> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'api',
        `repos/${owner}/${repo}/issues/comments/${commentId}`,
        '-X',
        'PATCH',
        '-F',
        `body=${body}`,
      ],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while updating comment: ${result.output}`)
    }
  }

  private async postComment(
    issueNumber: number,
    owner: string,
    repo: string,
    body: string,
    project: ProjectConfig
  ): Promise<string | undefined> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'api',
        `repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        '-X',
        'POST',
        '-F',
        `body=${body}`,
      ],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while commenting on issue: ${result.output}`)
    }

    try {
      const parsed = JSON.parse(result.output || '{}') as { id?: number }
      return parsed.id !== undefined ? String(parsed.id) : undefined
    } catch {
      return undefined
    }
  }

  private async assignIssue(
    issueNumber: number,
    owner: string,
    repo: string,
    project: ProjectConfig
  ): Promise<void> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'issue',
        'edit',
        String(issueNumber),
        '--repo',
        `${owner}/${repo}`,
        '--add-assignee',
        '@me',
      ],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while assigning issue: ${result.output}`)
    }
  }
}
