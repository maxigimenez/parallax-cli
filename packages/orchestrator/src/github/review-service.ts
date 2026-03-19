import { ProjectConfig } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message?: string }>
}

type PullRequestReviewThreadsResponse = {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        nodes?: Array<{
          id: string
          isResolved: boolean
          path?: string | null
          line?: number | null
          originalLine?: number | null
          comments?: {
            nodes?: Array<{
              id: string
              body?: string | null
              path?: string | null
              line?: number | null
              originalLine?: number | null
              url?: string | null
              author?: {
                login?: string | null
                __typename?: string | null
              } | null
            }>
          } | null
        }>
      }
    }
  }
}

type PullRequestDetailsResponse = {
  repository?: {
    pullRequest?: {
      url?: string | null
      headRefName?: string | null
      state?: string | null
    }
  }
}

export type PullRequestReviewComment = {
  threadId: string
  commentId: string
  authorLogin: string
  body: string
  path: string
  line?: number
  originalLine?: number
  url?: string
}

function isAutomatedReviewer(login: string, actorType?: string | null) {
  const normalizedLogin = login.trim().toLowerCase()

  if (actorType === 'Bot') {
    return true
  }

  if (
    normalizedLogin.endsWith('[bot]') ||
    normalizedLogin.endsWith('-bot') ||
    normalizedLogin.includes('github-actions')
  ) {
    return true
  }

  const ignoredAutomationActors = new Set([
    'vercel',
    'vercel[bot]',
    'codecov',
    'codecov[bot]',
    'chromatic-com[bot]',
    'dependabot[bot]',
    'netlify',
    'netlify[bot]',
    'percy',
    'percy[bot]',
    'renovate[bot]',
  ])

  return ignoredAutomationActors.has(normalizedLogin)
}

export class GitHubReviewService {
  constructor(private executor: HostExecutor) {}

  private async resolveRepoDetails(project: ProjectConfig) {
    const configuredOwner = project.pullFrom.filters.owner?.trim()
    const configuredRepo = project.pullFrom.filters.repo?.trim()

    if (configuredOwner && configuredRepo) {
      return { owner: configuredOwner, repo: configuredRepo }
    }

    const result = await this.executor.executeCommand(
      ['gh', 'repo', 'view', '--json', 'owner,name'],
      { cwd: project.workspaceDir }
    )

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while resolving repository details: ${result.output}`)
    }

    const payload = JSON.parse(result.output || '{}') as {
      owner?: { login?: string | null } | null
      name?: string | null
    }

    const owner = payload.owner?.login?.trim()
    const repo = payload.name?.trim()
    if (!owner || !repo) {
      throw new Error(`Unable to resolve GitHub repository from workspace ${project.workspaceDir}.`)
    }

    return { owner, repo }
  }

  private async executeGraphql<T>(
    project: ProjectConfig,
    query: string,
    variables: Record<string, string | number>
  ): Promise<T> {
    const { owner, repo } = await this.resolveRepoDetails(project)
    const command = [
      'gh',
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `repo=${repo}`,
    ]

    for (const [key, value] of Object.entries(variables)) {
      command.push('-F', `${key}=${String(value)}`)
    }

    const result = await this.executor.executeCommand(command, {
      cwd: project.workspaceDir,
    })

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Please install and authenticate gh.')
    }

    if (result.exitCode !== 0) {
      throw new Error(`GitHub CLI failed while querying PR review data: ${result.output}`)
    }

    const payload = JSON.parse(result.output || '{}') as GraphqlResponse<T>
    if (payload.errors?.length) {
      throw new Error(
        payload.errors.map((error) => error.message || 'Unknown GitHub GraphQL error').join('\n')
      )
    }

    if (!payload.data) {
      throw new Error('GitHub GraphQL response did not include data.')
    }

    return payload.data
  }

  async getPullRequestDetails(project: ProjectConfig, prNumber: number) {
    const data = await this.executeGraphql<PullRequestDetailsResponse>(
      project,
      `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              url
              headRefName
              state
            }
          }
        }
      `,
      { number: prNumber }
    )

    const pullRequest = data.repository?.pullRequest
    if (!pullRequest?.headRefName || !pullRequest.url) {
      throw new Error(`Pull request #${prNumber} was not found.`)
    }

    return {
      url: pullRequest.url,
      headRefName: pullRequest.headRefName,
      state: pullRequest.state ?? 'UNKNOWN',
    }
  }

  async listOpenReviewComments(
    project: ProjectConfig,
    prNumber: number
  ): Promise<PullRequestReviewComment[]> {
    const data = await this.executeGraphql<PullRequestReviewThreadsResponse>(
      project,
      `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  path
                  line
                  originalLine
                  comments(first: 20) {
                    nodes {
                      id
                      body
                      path
                      line
                      originalLine
                      url
                      author {
                        login
                        __typename
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { number: prNumber }
    )

    const threads = data.repository?.pullRequest?.reviewThreads?.nodes ?? []
    const comments: PullRequestReviewComment[] = []

    for (const thread of threads) {
      if (!thread || thread.isResolved) {
        continue
      }

      const threadComments = thread.comments?.nodes ?? []
      for (const comment of threadComments) {
        const authorLogin = comment.author?.login?.trim()
        if (!authorLogin || !comment.id || !comment.body?.trim()) {
          continue
        }

        if (isAutomatedReviewer(authorLogin, comment.author?.__typename)) {
          continue
        }

        const path = (comment.path ?? thread.path ?? '').trim()
        if (!path) {
          continue
        }

        comments.push({
          threadId: thread.id,
          commentId: comment.id,
          authorLogin,
          body: comment.body.trim(),
          path,
          line: comment.line ?? thread.line ?? undefined,
          originalLine: comment.originalLine ?? thread.originalLine ?? undefined,
          url: comment.url ?? undefined,
        })
      }
    }

    return comments
  }

  async resolveReviewThreads(project: ProjectConfig, threadIds: string[]) {
    const uniqueThreadIds = Array.from(new Set(threadIds.filter(Boolean)))

    for (const threadId of uniqueThreadIds) {
      await this.executeGraphql(
        project,
        `
          mutation($threadId: ID!) {
            resolveReviewThread(input: { threadId: $threadId }) {
              thread {
                id
                isResolved
              }
            }
          }
        `,
        { threadId }
      )
    }
  }
}

export function formatPullRequestReviewComments(comments: PullRequestReviewComment[]) {
  return comments
    .map((comment, index) => {
      const location = comment.line ? `${comment.path}:${comment.line}` : comment.path
      const urlLine = comment.url ? `\nComment URL: ${comment.url}` : ''

      return [
        `${index + 1}. Reviewer: ${comment.authorLogin}`,
        `Location: ${location}`,
        `Comment: ${comment.body}${urlLine}`,
      ].join('\n')
    })
    .join('\n\n')
}
