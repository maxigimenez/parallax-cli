import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubPullRequestService } from '../src/github-pr-service'

const executeCommandMock = vi.fn()

describe('GitHubPullRequestService', () => {
  beforeEach(() => {
    executeCommandMock.mockReset()
  })

  it('lists managed pull requests using the Parallax label', async () => {
    executeCommandMock.mockResolvedValueOnce({
      exitCode: 0,
      output: JSON.stringify([
        {
          number: 7,
          title: 'Test PR',
          url: 'https://github.com/org/repo/pull/7',
          headRefName: 'task/eng-7',
          baseRefName: 'main',
          reviewDecision: 'CHANGES_REQUESTED',
        },
      ]),
    })

    const service = new GitHubPullRequestService({ executeCommand: executeCommandMock } as any)
    const prs = await service.listManagedPullRequests({ workspaceDir: '/tmp/repo' } as any)

    expect(prs).toHaveLength(1)
    expect(executeCommandMock).toHaveBeenCalledWith(
      [
        'gh',
        'pr',
        'list',
        '--state',
        'open',
        '--label',
        'parallax-managed',
        '--json',
        'number,title,url,headRefName,baseRefName,reviewDecision',
      ],
      { cwd: '/tmp/repo' }
    )
  })

  it('builds review context only from new requested changes feedback', async () => {
    executeCommandMock
      .mockResolvedValueOnce({ exitCode: 0, output: 'org/repo\n' })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: [
                    {
                      state: 'CHANGES_REQUESTED',
                      body: 'Please tighten the validation logic.',
                      submittedAt: '2026-03-02T12:00:00Z',
                      author: { login: 'reviewer-a' },
                    },
                  ],
                },
                reviewThreads: {
                  nodes: [
                    {
                      isResolved: false,
                      comments: {
                        nodes: [
                          {
                            body: 'Handle empty input as well.',
                            path: 'src/form.ts',
                            line: 42,
                            updatedAt: '2026-03-02T12:05:00Z',
                            author: { login: 'reviewer-b' },
                          },
                        ],
                      },
                    },
                    {
                      isResolved: true,
                      comments: {
                        nodes: [
                          {
                            body: 'Resolved thread should be ignored.',
                            path: 'src/ignored.ts',
                            line: 9,
                            updatedAt: '2026-03-02T12:06:00Z',
                            author: { login: 'reviewer-c' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify([
          {
            body: 'parallax fix all comments',
            updated_at: '2026-03-02T12:10:00Z',
            user: { login: 'maxi' },
          },
        ]),
      })

    const service = new GitHubPullRequestService({ executeCommand: executeCommandMock } as any)
    const context = await service.getReviewContext(
      { workspaceDir: '/tmp/repo' } as any,
      {
        number: 7,
        title: 'Test PR',
        url: 'https://github.com/org/repo/pull/7',
        headRefName: 'task/eng-7',
        baseRefName: 'main',
        reviewDecision: 'CHANGES_REQUESTED',
      },
      '2026-03-02T11:00:00Z'
    )

    expect(context).toEqual({
      prNumber: 7,
      prUrl: 'https://github.com/org/repo/pull/7',
      branchName: 'task/eng-7',
      baseBranch: 'main',
      latestFeedbackAt: '2026-03-02T12:10:00Z',
      feedback: expect.stringContaining('Please tighten the validation logic.'),
    })
    expect(context?.feedback).toContain('Manual follow-up requested by maxi')
    expect(context?.feedback).toContain('src/form.ts:42')
    expect(context?.feedback).not.toContain('Resolved thread should be ignored.')
  })

  it('returns null when unresolved review feedback was already handled', async () => {
    executeCommandMock
      .mockResolvedValueOnce({ exitCode: 0, output: 'org/repo\n' })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: [
                    {
                      state: 'CHANGES_REQUESTED',
                      body: 'Already handled.',
                      submittedAt: '2026-03-02T12:00:00Z',
                      author: { login: 'reviewer-a' },
                    },
                  ],
                },
                reviewThreads: {
                  nodes: [
                    {
                      isResolved: false,
                      comments: {
                        nodes: [
                          {
                            body: 'Already handled unresolved thread.',
                            path: 'src/form.ts',
                            line: 42,
                            updatedAt: '2026-03-02T12:01:00Z',
                            author: { login: 'reviewer-b' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify([
          {
            body: 'parallax fix all comments',
            updated_at: '2026-03-02T12:01:00Z',
            user: { login: 'maxi' },
          },
        ]),
      })

    const service = new GitHubPullRequestService({ executeCommand: executeCommandMock } as any)
    const context = await service.getReviewContext(
      { workspaceDir: '/tmp/repo' } as any,
      {
        number: 7,
        title: 'Test PR',
        url: 'https://github.com/org/repo/pull/7',
        headRefName: 'task/eng-7',
        baseRefName: 'main',
        reviewDecision: 'CHANGES_REQUESTED',
      },
      '2026-03-02T12:10:00Z'
    )

    expect(context).toBeNull()
  })

  it('requires explicit trigger comment for review follow-up', async () => {
    executeCommandMock
      .mockResolvedValueOnce({ exitCode: 0, output: 'org/repo\n' })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: { nodes: [] },
                reviewThreads: { nodes: [] },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: JSON.stringify([
          {
            body: 'parallax fix all comments',
            updated_at: '2026-03-02T13:00:00Z',
            user: { login: 'maxi' },
          },
          {
            body: 'Vercel preview: https://example.vercel.app',
            updated_at: '2026-03-02T13:01:00Z',
            user: { login: 'vercel[bot]' },
          },
        ]),
      })

    const service = new GitHubPullRequestService({ executeCommand: executeCommandMock } as any)
    const context = await service.getReviewContext(
      { workspaceDir: '/tmp/repo' } as any,
      {
        number: 8,
        title: 'Comment-only PR',
        url: 'https://github.com/org/repo/pull/8',
        headRefName: 'task/eng-8',
        baseRefName: 'main',
        reviewDecision: null,
      },
      '2026-03-02T12:00:00Z'
    )

    expect(context).toEqual({
      prNumber: 8,
      prUrl: 'https://github.com/org/repo/pull/8',
      branchName: 'task/eng-8',
      baseBranch: 'main',
      latestFeedbackAt: '2026-03-02T13:00:00Z',
      feedback: 'Manual follow-up requested by maxi: parallax fix all comments',
    })
  })
})
