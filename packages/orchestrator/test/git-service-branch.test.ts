import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitMock = {
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  raw: vi.fn(),
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => gitMock),
}))

import { GitService } from '../src/git-service'

describe('GitService branch reuse', () => {
  beforeEach(() => {
    gitMock.status.mockReset()
    gitMock.add.mockReset()
    gitMock.commit.mockReset()
    gitMock.raw.mockReset()
  })

  it('pushes review updates back to the stored PR branch', async () => {
    gitMock.status.mockResolvedValue({ isClean: () => false })
    gitMock.add.mockResolvedValue(undefined)
    gitMock.commit.mockResolvedValue(undefined)
    gitMock.raw.mockResolvedValue(undefined)

    const gitService = new GitService({ executeCommand: vi.fn() } as any)
    const branchName = await gitService.commitAndPush('/tmp/worktree', {
      externalId: 'e340140c8be1',
      branchName: 'task/eng-88-review',
      title: 'Review follow-up',
    } as any)

    expect(branchName).toBe('task/eng-88-review')
    expect(gitMock.raw).toHaveBeenCalledWith([
      'push',
      'origin',
      'HEAD:task/eng-88-review',
      '--set-upstream',
    ])
  })

  it('uses sanitized AI commit messages when provided', async () => {
    gitMock.status.mockResolvedValue({ isClean: () => false })
    gitMock.add.mockResolvedValue(undefined)
    gitMock.commit.mockResolvedValue(undefined)
    gitMock.raw.mockResolvedValue(undefined)

    const gitService = new GitService({ executeCommand: vi.fn() } as any)
    await gitService.commitAndPush(
      '/tmp/worktree',
      {
        externalId: 'e340140c8be1',
        branchName: 'task/e340140c8be1-review',
        title: 'Review follow-up',
      } as any,
      { commitMessage: '  Address   review \n comments ' }
    )

    expect(gitMock.commit).toHaveBeenCalledWith('Address review comments')
  })
})
