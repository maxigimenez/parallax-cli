import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitMock = {
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
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
    gitMock.push.mockReset()
  })

  it('pushes review updates back to the stored PR branch', async () => {
    gitMock.status.mockResolvedValue({ isClean: () => false })
    gitMock.add.mockResolvedValue(undefined)
    gitMock.commit.mockResolvedValue(undefined)
    gitMock.push.mockResolvedValue(undefined)

    const gitService = new GitService({ executeCommand: vi.fn() } as any)
    const branchName = await gitService.commitAndPush('/tmp/worktree', {
      externalId: 'ENG-88',
      branchName: 'task/eng-88-review',
      title: 'Review follow-up',
    } as any)

    expect(branchName).toBe('task/eng-88-review')
    expect(gitMock.push).toHaveBeenCalledWith('origin', 'task/eng-88-review', ['-u', '--force'])
  })
})
