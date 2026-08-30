import {
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  type CommentTarget,
  type ProjectConfig,
  type TriggerEvent,
} from '@parallax/common'
import type { TrackerWriter, TriggerSource } from '../triggers/types.js'

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message?: string }>
}

interface IssueNode {
  id: string
  identifier: string
  title: string
  description?: string | null
  url?: string
  updatedAt?: string
  state?: { name?: string }
  labels?: { nodes: Array<{ name: string }> }
}

const ISSUES_QUERY = `
  query Issues($filter: IssueFilter) {
    issues(filter: $filter, first: 100) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        state { name }
        labels { nodes { name } }
      }
    }
  }
`

export class LinearService implements TriggerSource, TrackerWriter {
  readonly name = 'linear'

  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string = 'https://api.linear.app/graphql'
  ) {
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY is required for Linear projects.')
    }
  }

  private async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.apiKey },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`Linear API request failed (${response.status} ${response.statusText}).`)
    }

    const body = (await response.json()) as GraphqlResponse<T>
    if (body.errors?.length) {
      throw new Error(
        `Linear API GraphQL error: ${body.errors.map((error) => error.message ?? 'unknown').join('; ')}`
      )
    }
    if (!body.data) {
      throw new Error('Linear API returned empty data.')
    }
    return body.data
  }

  // ── Trigger source ─────────────────────────────────────────

  async collect(project: ProjectConfig): Promise<TriggerEvent[]> {
    if (project.provider !== TICKET_PROVIDER.LINEAR) {
      return []
    }

    const { team, state, labels, project: projectName } = project.filters
    const filter: Record<string, unknown> = {}
    if (team) {
      filter.team = { key: { eq: team } }
    }
    if (state) {
      filter.state = { name: { eq: state } }
    }
    if (labels?.length) {
      filter.labels = { name: { in: labels } }
    }
    if (projectName) {
      filter.project = { name: { eq: projectName } }
    }

    const data = await this.request<{ issues: { nodes: IssueNode[] } }>(ISSUES_QUERY, { filter })

    return data.issues.nodes.map((issue) => ({
      type: TRIGGER_TYPE.TICKET,
      projectId: project.id,
      provider: TICKET_PROVIDER.LINEAR,
      ref: issue.identifier,
      // Linear's updatedAt moves on label and state changes, which is exactly
      // the set of edits that should re-trigger a route.
      revision: issue.updatedAt ?? '',
      title: issue.title,
      body: issue.description ?? '',
      url: issue.url,
      state: issue.state?.name,
      labels: issue.labels?.nodes.map((label) => label.name) ?? [],
    }))
  }

  // ── Tracker writer ─────────────────────────────────────────

  private async findIssueId(identifier: string): Promise<string> {
    const data = await this.request<{ issue: { id: string } | null }>(
      `query Issue($id: String!) { issue(id: $id) { id } }`,
      { id: identifier }
    )
    if (!data.issue) {
      throw new Error(`Linear issue "${identifier}" not found.`)
    }
    return data.issue.id
  }

  async postComment(_target: CommentTarget, event: TriggerEvent, body: string): Promise<void> {
    const issueId = await this.findIssueId(event.ref)
    await this.request(
      `mutation Comment($issueId: String!, $body: String!) {
         commentCreate(input: { issueId: $issueId, body: $body }) { success }
       }`,
      { issueId, body }
    )
  }

  async updateLabels(
    event: TriggerEvent,
    labels: { add?: string[]; remove?: string[] }
  ): Promise<void> {
    if (!labels.add?.length && !labels.remove?.length) {
      return
    }

    const issueId = await this.findIssueId(event.ref)

    // Linear's API takes the full label set rather than a delta, so the current
    // set has to be read and recomputed. Names are resolved to ids against the
    // issue's team, since label ids are team-scoped.
    const data = await this.request<{
      issue: {
        labels: { nodes: Array<{ id: string; name: string }> }
        team: { labels: { nodes: Array<{ id: string; name: string }> } }
      } | null
    }>(
      `query IssueLabels($id: String!) {
         issue(id: $id) {
           labels { nodes { id name } }
           team { labels { nodes { id name } } }
         }
       }`,
      { id: event.ref }
    )

    if (!data.issue) {
      throw new Error(`Linear issue "${event.ref}" not found.`)
    }

    const byName = new Map(
      data.issue.team.labels.nodes.map((label) => [label.name.toLowerCase(), label.id])
    )
    const remove = new Set(
      (labels.remove ?? []).map((name) => byName.get(name.toLowerCase())).filter(Boolean)
    )

    const next = new Set(data.issue.labels.nodes.map((label) => label.id))
    for (const id of remove) {
      next.delete(id as string)
    }
    for (const name of labels.add ?? []) {
      const id = byName.get(name.toLowerCase())
      if (!id) {
        throw new Error(`Linear label "${name}" does not exist on this issue's team.`)
      }
      next.add(id)
    }

    await this.request(
      `mutation SetLabels($issueId: String!, $labelIds: [String!]!) {
         issueUpdate(id: $issueId, input: { labelIds: $labelIds }) { success }
       }`,
      { issueId, labelIds: [...next] }
    )
  }
}
