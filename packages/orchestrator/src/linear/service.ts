import { PULL_PROVIDER, TASK_STATUS, Task, ProjectConfig } from '@parallax/common'
import { createTaskId } from '../task-id.js'

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message?: string }>
}

type IssueNode = {
  id: string
  identifier: string
  title: string
  description?: string | null
}

type WorkflowStateNode = {
  id: string
}

export class LinearService {
  private readonly apiKey: string
  private readonly endpoint: string

  constructor(apiKey: string, endpoint: string = 'https://api.linear.app/graphql') {
    this.apiKey = apiKey
    this.endpoint = endpoint
  }

  private async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`Linear API request failed (${response.status} ${response.statusText}).`)
    }

    const body = (await response.json()) as GraphqlResponse<T>
    if (body.errors && body.errors.length > 0) {
      const message = body.errors.map((err) => err.message ?? 'unknown').join('; ')
      throw new Error(`Linear API GraphQL error: ${message}`)
    }

    if (!body.data) {
      throw new Error('Linear API returned empty data.')
    }

    return body.data
  }

  async fetchNewIssues(project: ProjectConfig): Promise<Task[]> {
    if (project.pullFrom.provider !== PULL_PROVIDER.LINEAR) {
      return []
    }

    const { filters } = project.pullFrom
    const filter: Record<string, unknown> = {}

    if (filters.team) {
      filter.team = { key: { eq: filters.team } }
    }
    if (filters.state) {
      filter.state = { name: { eq: filters.state } }
    }
    if (filters.labels?.length) {
      filter.labels = { name: { in: filters.labels } }
    }
    if (filters.project) {
      filter.project = { name: { eq: filters.project } }
    }

    const data = await this.request<{ issues: { nodes: IssueNode[] } }>(
      `
        query Issues($filter: IssueFilter) {
          issues(filter: $filter) {
            nodes {
              id
              identifier
              title
              description
            }
          }
        }
      `,
      { filter }
    )

    return data.issues.nodes.map((issue) => ({
      id: createTaskId(project.id, issue.identifier),
      externalId: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      status: TASK_STATUS.PENDING,
      projectId: project.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
  }

  async markAsInProgress(externalId: string) {
    const [teamKey, issueNumber] = externalId.split('-')
    const issueNumberParsed = Number.parseInt(issueNumber, 10)
    if (!teamKey || !Number.isFinite(issueNumberParsed)) {
      return
    }

    const issueData = await this.request<{ issues: { nodes: IssueNode[] } }>(
      `
        query IssueByExternalId($teamKey: String!, $issueNumber: Float!) {
          issues(
            filter: {
              team: { key: { eq: $teamKey } }
              number: { eq: $issueNumber }
            }
          ) {
            nodes {
              id
              identifier
              title
              description
            }
          }
        }
      `,
      { teamKey, issueNumber: issueNumberParsed }
    )
    const issue = issueData.issues.nodes[0]
    if (!issue) {
      return
    }

    const viewerData = await this.request<{ viewer: { id: string } }>(
      `
        query Viewer {
          viewer {
            id
          }
        }
      `
    )

    const workflowData = await this.request<{ workflowStates: { nodes: WorkflowStateNode[] } }>(
      `
        query WorkflowStates($teamKey: String!) {
          workflowStates(
            filter: {
              team: { key: { eq: $teamKey } }
              name: { eq: "In Progress" }
            }
          ) {
            nodes {
              id
            }
          }
        }
      `,
      { teamKey }
    )

    const inProgressState = workflowData.workflowStates.nodes[0]
    if (!inProgressState) {
      return
    }

    await this.request(
      `
        mutation UpdateIssue($id: String!, $assigneeId: String, $stateId: String) {
          issueUpdate(
            id: $id
            input: { assigneeId: $assigneeId, stateId: $stateId }
          ) {
            success
          }
        }
      `,
      { id: issue.id, assigneeId: viewerData.viewer.id, stateId: inProgressState.id }
    )

    await this.request(
      `
        mutation CreateComment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
          }
        }
      `,
      {
        issueId: issue.id,
        body: '🤖 Parallax has started working on this task. Using local host environment.',
      }
    )
  }
}
