import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LinearService } from '../src/linear-service'

const issuesMock = vi.fn()

vi.mock('@linear/sdk', () => {
  return {
    LinearClient: vi.fn().mockImplementation(() => {
      return {
        issues: issuesMock.mockResolvedValue({
          nodes: [
            {
              identifier: 'TEST-1',
              title: 'Test Issue',
              description: 'Description',
            },
          ],
        }),
      }
    }),
  }
})

describe('LinearService', () => {
  beforeEach(() => {
    issuesMock.mockClear()
  })

  it('should fetch and map issues correctly', async () => {
    const service = new LinearService('fake-key')
    const project = {
      id: 'p1',
      pullFrom: {
        provider: 'linear',
        filters: {
          team: 'TEST',
          state: 'Todo',
          labels: ['ai-ready'],
        },
      },
    } as any
    const tasks = await service.fetchNewIssues(project)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].externalId).toBe('TEST-1')
    expect(tasks[0].status).toBe('PENDING')
    expect(issuesMock).toHaveBeenCalledWith({
      filter: {
        team: { key: { eq: 'TEST' } },
        state: { name: { eq: 'Todo' } },
        labels: { name: { in: ['ai-ready'] } },
      },
    })
  })

  it('should skip non-linear providers', async () => {
    const service = new LinearService('fake-key')
    const tasks = await service.fetchNewIssues({
      id: 'p2',
      pullFrom: {
        provider: 'github',
        filters: {},
      },
    } as any)

    expect(tasks).toEqual([])
    expect(issuesMock).not.toHaveBeenCalled()
  })
})
