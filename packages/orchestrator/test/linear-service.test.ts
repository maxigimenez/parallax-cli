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
                labels: { nodes: [{ name: 'ai-ready' }] },
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
    expect(tasks[0].labels).toEqual(['ai-ready'])
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

  it('returns an empty labels array when issue has no labels', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [{ id: 'lin_2', identifier: 'TEST-2', title: 'No labels', description: null }],
          },
        },
      }),
    })

    const service = new LinearService('fake-key')
    const project = {
      id: 'p1',
      pullFrom: { provider: 'linear', filters: { team: 'TEST' } },
    } as any

    const tasks = await service.fetchNewIssues(project)

    expect(tasks[0].labels).toEqual([])
  })

  it('includes labels field in the GraphQL query', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { issues: { nodes: [] } },
      }),
    })

    const service = new LinearService('fake-key')
    await service.fetchNewIssues({
      id: 'p1',
      pullFrom: { provider: 'linear', filters: {} },
    } as any)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.query).toContain('labels')
    expect(body.query).toContain('nodes')
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
