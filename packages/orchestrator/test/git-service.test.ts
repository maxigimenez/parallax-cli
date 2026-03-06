import { describe, it, expect, vi } from 'vitest'
import { GitService } from '../src/git-service'

describe('GitService', () => {
  it('should format PR parameters correctly via gh CLI', async () => {
    const mockExecutor = {
      executeCommand: vi
        .fn()
        .mockResolvedValueOnce({ exitCode: 0, output: '' })
        .mockResolvedValueOnce({ exitCode: 0, output: 'https://github.com/org/repo/pull/1' }),
    }
    const gitService = new GitService(mockExecutor as any)
    const task = { externalId: 'REV-27', title: 'UX Fix', description: 'Desc' } as any

    const prUrl = await gitService.createPullRequest('/tmp/worktree', task, {
      prTitle: 'Improve onboarding flow',
      prSummary: '- Updated onboarding UI\n- Added validation\n- Ran tests',
    })
    expect(prUrl).toBe('https://github.com/org/repo/pull/1')
    expect(mockExecutor.executeCommand).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining(['gh', 'label', 'create', 'parallax-managed']),
      expect.any(Object)
    )
    expect(mockExecutor.executeCommand).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(['gh', 'pr', 'create']),
      expect.any(Object)
    )

    const command = mockExecutor.executeCommand.mock.calls[1][0]
    expect(command).toContain('--title')
    expect(command).toContain('[Parallax] REV-27: Improve onboarding flow')
    expect(command).toContain('--body')
    expect(command).toContain('--label')
    expect(command).toContain('parallax-managed')
    expect(command.join(' ')).toContain('AI Change Summary')
  })
})
