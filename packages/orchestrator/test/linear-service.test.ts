import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LinearService } from '../src/linear/service'

const fetchMock = vi.fn()
const originalFetch = global.fetch

describe('LinearService', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('should fetch and map issues correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [
              {
                id: 'lin_1',
                identifier: 'TEST-1',
                title: 'Test Issue',
                description: 'Description',
              },
            ],
          },
        },
      }),
    })

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
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'fake-key',
      },
      body: expect.stringContaining('"team":{"key":{"eq":"TEST"}}'),
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
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
