import { describe, it, expect, vi } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/ai-adapters/claude-code-adapter.js'
import { PlanResultStatus } from '@parallax/common'

describe('ClaudeCodeAdapter', () => {
  const mockLogger = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  }

  it('builds the Claude Code command with acceptEdits and no bypass mode', async () => {
    const mockExecutor = { executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }) }
    const adapter = new ClaudeCodeAdapter(mockExecutor as any, mockLogger as any)
    const task = { id: 'task-1', externalId: 'REV-401', title: 'UX', description: 'Desc' } as any
    const project = { agent: { model: 'sonnet' } } as any

    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    await adapter.runTask(task, '/tmp/dir', project)

    const command = mockExecutor.executeCommand.mock.calls[0][0]
    expect(command).toEqual(
      expect.arrayContaining([
        'claude',
        '--model',
        'sonnet',
        '--permission-mode',
        'acceptEdits',
        '--output-format',
        'stream-json',
        '--verbose',
        '-p',
      ])
    )
    expect(command).not.toEqual(expect.arrayContaining(['--dangerously-skip-permissions']))
  })

  it('extracts PR metadata from Claude Code stream-json result output', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Reviewing files and preparing changes.' }],
            },
          }),
        })
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'result',
            result:
              'Work complete\nPARALLAX_PR_TITLE: Improve dashboard loading\nPARALLAX_PR_SUMMARY:\n- Reduced N+1 queries\n- Added loading states',
          }),
        })
        return { exitCode: 0, output: '', stdout: '', stderr: '' }
      }),
    }
    const adapter = new ClaudeCodeAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-402', title: 'Perf', description: 'Desc' } as any
    const project = { agent: { model: 'sonnet' } } as any

    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    const result = await adapter.runTask(task, '/tmp/dir', project)

    expect(result.prTitle).toBe('Improve dashboard loading')
    expect(result.prSummary).toContain('Reduced N+1 queries')
  })

  it('extracts commit metadata for review execution output', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'result',
            result: 'Done\nPARALLAX_COMMIT_MESSAGE: Tighten dashboard loading flow',
          }),
        })
        return { exitCode: 0, output: '', stdout: '', stderr: '' }
      }),
    }
    const adapter = new ClaudeCodeAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-403', title: 'Review', description: 'Desc' } as any
    const project = { agent: { model: 'sonnet' } } as any

    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    const result = await adapter.runTask(task, '/tmp/dir', project, 'approved plan', 'commit')

    expect(result.commitMessage).toBe('Tighten dashboard loading flow')
  })

  it('parses PLAN_READY responses in plan mode', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'result',
            result: [
              'STATUS: PLAN_READY',
              'SUMMARY: Update auth flow',
              'PLAN:',
              '- Inspect auth middleware',
              '- Update refresh flow',
            ].join('\n'),
          }),
        })
        return { exitCode: 0, output: '', stdout: '', stderr: '' }
      }),
    }

    const adapter = new ClaudeCodeAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-404', title: 'Auth refresh', description: 'Refresh flow' } as any
    const project = { agent: { model: 'sonnet' } } as any

    const result = await adapter.runPlan(task, '/tmp/repo', project)

    expect(result.success).toBe(true)
    expect(result.status).toBe(PlanResultStatus.PLAN_READY)
    expect(result.planMarkdown).toContain('Inspect auth middleware')
  })

  it('emits streamed assistant updates before the final result', async () => {
    const localLogger = {
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      event: vi.fn(),
    }
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'system',
            subtype: 'init',
            session_id: 'session-123',
          }),
        })
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                { type: 'text', text: 'Inspecting the current implementation.' },
                { type: 'tool_use', name: 'Bash', input: 'git status --short' },
              ],
            },
          }),
        })
        options.onData({
          stream: 'stdout',
          line: JSON.stringify({
            type: 'result',
            result: 'Done\nPARALLAX_COMMIT_MESSAGE: Apply requested review fix',
          }),
        })
        return { exitCode: 0, output: '', stdout: '', stderr: '' }
      }),
    }

    const adapter = new ClaudeCodeAdapter(mockExecutor as any, localLogger as any)
    const task = { id: 'task-405', externalId: 'REV-405', title: 'Review', description: 'Desc' } as any
    const project = { agent: { model: 'sonnet' } } as any

    vi.spyOn(adapter, 'setupWorkspace').mockResolvedValue()

    await adapter.runTask(task, '/tmp/dir', project, 'approved plan', 'commit')

    expect(localLogger.event).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-405',
        title: 'Claude session',
        message: 'Session started: session-123',
      })
    )
    expect(localLogger.event).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-405',
        title: 'Agent update',
        message: 'Inspecting the current implementation.',
      })
    )
    expect(localLogger.event).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-405',
        title: 'Tool Bash',
        message: 'git status --short',
      })
    )
  })
})
