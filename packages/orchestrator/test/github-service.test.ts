import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubService } from '../src/github/service'

const executeCommandMock = vi.fn()

describe('GitHubService', () => {
  beforeEach(() => {
    executeCommandMock.mockReset()
  })

  it('should fetch and map GitHub issues correctly', async () => {
    executeCommandMock.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify([
        {
          number: 27,
          title: 'Fix dashboard refresh',
          body: 'Description',
        },
      ]),
    })

    const service = new GitHubService({ executeCommand: executeCommandMock } as any)
    const project = {
      id: 'p1',
      workspaceDir: '/tmp/repo',
      pullFrom: {
        provider: 'github',
        filters: {
          owner: 'org',
          repo: 'repo',
          state: 'open',
          labels: ['ai-ready'],
        },
      },
    } as any

    const tasks = await service.fetchNewIssues(project)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].externalId).toBe('org/repo#27')
    expect(tasks[0].status).toBe('PENDING')
    expect(executeCommandMock).toHaveBeenCalledWith(
      [
        'gh',
        'issue',
        'list',
        '--repo',
        'org/repo',
        '--json',
        'number,title,body',
        '--limit',
        '100',
        '--state',
        'open',
        '--label',
        'ai-ready',
      ],
      { cwd: '/tmp/repo' }
    )
  })

  it('should comment when a GitHub task starts', async () => {
    executeCommandMock.mockResolvedValue({ exitCode: 0, output: '' })
    const service = new GitHubService({ executeCommand: executeCommandMock } as any)

    await service.markAsInProgress('org/repo#42', {
      id: 'p1',
      workspaceDir: '/tmp/repo',
      pullFrom: {
        provider: 'github',
        filters: {
          owner: 'org',
          repo: 'repo',
        },
      },
    } as any)

    expect(executeCommandMock).toHaveBeenCalledWith(
      [
        'gh',
        'issue',
        'comment',
        '42',
        '--repo',
        'org/repo',
        '--body',
        'Parallax has started working on this task in the local host environment.',
      ],
      { cwd: '/tmp/repo' }
    )
  })
})
