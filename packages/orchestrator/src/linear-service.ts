import { LinearClient } from '@linear/sdk'
import { Task, ProjectConfig } from '@parallax/common'
import { createTaskId } from './task-id.js'

export class LinearService {
  private client: LinearClient

  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey })
  }

  async fetchNewIssues(project: ProjectConfig): Promise<Task[]> {
    if (project.pullFrom.provider !== 'linear') {
      return []
    }

    const { filters } = project.pullFrom
    const filter: any = {}

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

    const issues = await this.client.issues({
      filter,
    })

    return issues.nodes.map((issue) => {
      return {
        id: createTaskId(),
        externalId: issue.identifier,
        title: issue.title,
        description: issue.description || '',
        status: 'PENDING',
        projectId: project.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    })
  }

  async markAsInProgress(externalId: string) {
    const [teamKey, issueNumber] = externalId.split('-')
    const issues = await this.client.issues({
      filter: {
        team: { key: { eq: teamKey } },
        number: { eq: parseInt(issueNumber) },
      },
    })
    const issue = issues.nodes[0]

    if (issue) {
      const me = await this.client.viewer
      const states = await this.client.workflowStates({ filter: { name: { eq: 'In Progress' } } })
      const inProgressState = states.nodes[0]

      await issue.update({
        assigneeId: me.id,
        stateId: inProgressState?.id,
      })

      await this.client.createComment({
        issueId: issue.id,
        body: '🤖 Parallax has started working on this task. Using local host environment.',
      })
    }
  }
}
