import { HostExecutor, ProjectConfig } from '@parallax/common'
import { PARALLAX_MANAGED_LABEL } from './github-constants.js'

export interface ManagedPullRequest {
  number: number
  title: string
  url: string
  headRefName: string
  baseRefName: string
  reviewDecision?: string | null
}

interface ReviewRecord {
  state?: string
  body?: string
  submittedAt?: string
  author?: { login?: string }
}

interface ReviewThreadCommentRecord {
  body?: string
  path?: string
  line?: number | null
  updatedAt?: string
  author?: { login?: string }
}

interface ReviewThreadRecord {
  isResolved: boolean
  comments: {
    nodes: ReviewThreadCommentRecord[]
  }
}

interface PullRequestGraphQLResponse {
  data?: {
    repository?: {
      pullRequest?: {
        reviews?: {
          nodes?: ReviewRecord[]
        }
        reviewThreads?: {
          nodes?: ReviewThreadRecord[]
        }
      }
    }
  }
}

interface IssueCommentRecord {
  body?: string
  updated_at?: string
  user?: { login?: string }
}

const PARALLAX_REVIEW_TRIGGER = /\bparallax\s+fix\s+all\s+comments\b/i

export interface PullRequestReviewContext {
  prNumber: number
  prUrl: string
  branchName: string
  baseBranch: string
  latestFeedbackAt: string
  feedback: string
}

export class GitHubPullRequestService {
  private repoCache = new Map<string, string>()

  constructor(private executor: HostExecutor) {}

  async listManagedPullRequests(project: ProjectConfig): Promise<ManagedPullRequest[]> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'pr',
        'list',
        '--state',
        'open',
        '--label',
        PARALLAX_MANAGED_LABEL,
        '--json',
        'number,title,url,headRefName,baseRefName,reviewDecision',
      ],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while listing pull requests: ${result.output}`)
    }

    return JSON.parse(result.output || '[]') as ManagedPullRequest[]
  }

  async getReviewContext(
    project: ProjectConfig,
    pr: ManagedPullRequest,
    lastHandledAt?: string
  ): Promise<PullRequestReviewContext | null> {
    const { owner, repo } = await this.getRepoCoordinates(project)
    const [response, issueComments] = await Promise.all([
      this.fetchGraphQL(project.workspaceDir, owner, repo, pr.number),
      this.fetchJson<IssueCommentRecord[]>(
        project.workspaceDir,
        `repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100`
      ),
    ])

    const reviews = response.data?.repository?.pullRequest?.reviews?.nodes || []
    const reviewThreads = response.data?.repository?.pullRequest?.reviewThreads?.nodes || []

    const actionableLines: string[] = []
    let latestFeedbackAt = ''
    let latestTriggerAt = ''
    let latestTriggerAuthor = 'operator'

    const isNewerThanLastHandled = (timestamp?: string) =>
      Boolean(timestamp && (!lastHandledAt || timestamp > lastHandledAt))

    for (const comment of issueComments) {
      const body = normalizeBody(comment.body)
      if (
        !body ||
        !PARALLAX_REVIEW_TRIGGER.test(body) ||
        !isNewerThanLastHandled(comment.updated_at)
      ) {
        continue
      }

      latestTriggerAt = maxTimestamp(latestTriggerAt, comment.updated_at)
      latestTriggerAuthor = comment.user?.login || 'operator'
    }

    if (!latestTriggerAt) {
      return null
    }

    actionableLines.push(
      `Manual follow-up requested by ${latestTriggerAuthor}: parallax fix all comments`
    )
    latestFeedbackAt = maxTimestamp(latestFeedbackAt, latestTriggerAt)

    for (const review of reviews) {
      if (review.state !== 'CHANGES_REQUESTED') {
        continue
      }

      latestFeedbackAt = maxTimestamp(latestFeedbackAt, review.submittedAt)
      actionableLines.push(
        `Requested changes from ${review.author?.login || 'reviewer'}: ${normalizeBody(review.body)}`
      )
    }

    for (const thread of reviewThreads) {
      if (thread.isResolved) {
        continue
      }

      const latestComment = thread.comments.nodes[thread.comments.nodes.length - 1]
      if (!latestComment) {
        continue
      }

      const timestamp = latestComment.updatedAt

      latestFeedbackAt = maxTimestamp(latestFeedbackAt, timestamp)
      const location = latestComment.path
        ? `${latestComment.path}${latestComment.line ? `:${latestComment.line}` : ''}`
        : 'unknown location'
      actionableLines.push(
        `Unresolved review thread from ${latestComment.author?.login || 'reviewer'} at ${location}: ${normalizeBody(latestComment.body)}`
      )
    }

    if (!actionableLines.length || !latestFeedbackAt) {
      return null
    }

    return {
      prNumber: pr.number,
      prUrl: pr.url,
      branchName: pr.headRefName,
      baseBranch: pr.baseRefName,
      latestFeedbackAt,
      feedback: actionableLines.join('\n'),
    }
  }

  private async fetchJson<T>(cwd: string, path: string): Promise<T> {
    const result = await this.executor.executeCommand(['gh', 'api', path], { cwd })

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while fetching PR review data: ${result.output}`)
    }

    return JSON.parse(result.output || '[]') as T
  }

  private async getRepoSlug(project: ProjectConfig): Promise<string> {
    const cached = this.repoCache.get(project.workspaceDir)
    if (cached) {
      return cached
    }

    const result = await this.executor.executeCommand(
      ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while resolving repository: ${result.output}`)
    }

    const repo = result.output.trim()
    this.repoCache.set(project.workspaceDir, repo)
    return repo
  }

  private async getRepoCoordinates(
    project: ProjectConfig
  ): Promise<{ owner: string; repo: string }> {
    const slug = await this.getRepoSlug(project)
    const [owner, repo] = slug.split('/')

    if (!owner || !repo) {
      throw new Error(`Unable to resolve repository coordinates from "${slug}"`)
    }

    return { owner, repo }
  }

  private async fetchGraphQL(
    cwd: string,
    owner: string,
    repo: string,
    pullRequestNumber: number
  ): Promise<PullRequestGraphQLResponse> {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviews(first: 100, states: [CHANGES_REQUESTED]) {
              nodes {
                state
                body
                submittedAt
                author {
                  login
                }
              }
            }
            reviewThreads(first: 100) {
              nodes {
                isResolved
                comments(first: 20) {
                  nodes {
                    body
                    path
                    line
                    updatedAt
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `.trim()

    const result = await this.executor.executeCommand(
      [
        'gh',
        'api',
        'graphql',
        '-F',
        `owner=${owner}`,
        '-F',
        `repo=${repo}`,
        '-F',
        `number=${pullRequestNumber}`,
        '-f',
        `query=${query}`,
      ],
      { cwd }
    )

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while fetching PR review data: ${result.output}`)
    }

    return JSON.parse(result.output || '{}') as PullRequestGraphQLResponse
  }
}

const normalizeBody = (body?: string) => (body || '').replace(/\s+/g, ' ').trim()

const maxTimestamp = (current: string, next?: string) => {
  if (!next) {
    return current
  }

  if (!current || next > current) {
    return next
  }

  return current
}
