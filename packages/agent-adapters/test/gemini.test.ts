import { describe, it, expect, vi } from 'vitest'
import { GeminiAdapter } from '../src/gemini-adapter.js'
import { PlanResultStatus } from '@parallax/common'

describe('GeminiAdapter', () => {
  const mockLogger = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  it('should construct the correct command', async () => {
    const mockExecutor = { executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }) }
    const adapter = new GeminiAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-27', title: 'UX', description: 'Desc' } as any
    const project = {
      agent: {
        model: 'flash',
        approvalMode: 'auto_edit',
        sandbox: true,
        allowedTools: ['read_file'],
      },
    } as any

    // Mock setupWorkspace since it's now in BaseAdapter
    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    await adapter.runTask(task, '/tmp/dir', project)

    const lastCall = mockExecutor.executeCommand.mock.calls.find((call) =>
      call[0].includes('gemini')
    )
    const command = lastCall[0]

    expect(command).toContain('--approval-mode')
    expect(command).toContain('auto_edit')
    expect(command).toContain('--sandbox')
    expect(command).toContain('--allowed-tools')
    expect(command).toContain('--prompt')
    expect(command).toContain('--model')
    expect(command).toContain('flash')
  })

  it('should extract PR metadata from model output', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output:
          'Work complete\nPARALLAX_PR_TITLE: Improve dashboard loading\nPARALLAX_PR_SUMMARY:\n- Reduced N+1 queries\n- Added loading states\n- Ran tests',
      }),
    }
    const adapter = new GeminiAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-28', title: 'Perf', description: 'Desc' } as any
    const project = { agent: { model: 'flash' } } as any

    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    const result = await adapter.runTask(task, '/tmp/dir', project)

    expect(result.prTitle).toBe('Improve dashboard loading')
    expect(result.prSummary).toContain('Reduced N+1 queries')
  })

  it('returns failed result when plan status is invalid', async () => {
    const mockExecutor = {
      executeCommand: vi
        .fn()
        .mockResolvedValue({ exitCode: 0, output: '{"status":"BROKEN","scope":"No-op"}' }),
    }
    const adapter = new GeminiAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-29', title: 'Status', description: 'Desc' } as any
    const project = { agent: {} } as any

    const result = await adapter.runPlan(task, '/tmp/dir', project)

    expect(result.success).toBe(false)
    expect(result.status).toBe(PlanResultStatus.PLAN_FAILED)
  })
})
