import { describe, it, expect, vi } from 'vitest'
import { CodexAdapter } from '../../src/ai-adapters/codex-adapter.js'
import { PlanResultStatus } from '@parallax/common'

describe('CodexAdapter plan mode', () => {
  const mockLogger = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  it('parses PLAN_READY responses with enum status', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: [
          'STATUS: PLAN_READY',
          'SUMMARY: Update auth flow',
          'PLAN:',
          '- Inspect auth middleware',
          '- Update refresh flow',
        ].join('\n'),
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = {
      externalId: 'REV-101',
      title: 'Auth refresh',
      description: 'Refresh flow',
    } as any
    const project = { agent: { model: 'codex-1' } } as any

    const result = await adapter.runPlan(task, '/tmp/repo', project)

    expect(result.success).toBe(true)
    expect(result.status).toBe(PlanResultStatus.PLAN_READY)
    expect(result.planMarkdown).toContain('Inspect auth middleware')
  })

  it('maps NEEDS_CLARIFICATION status to a successful non-failed plan result', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: [
          'STATUS: NEEDS_CLARIFICATION',
          'SUMMARY: Missing deployment context',
          'PLAN:',
          '- Validate assumptions against current repo',
          'QUESTIONS:',
          '- Which environment should be targeted?',
        ].join('\n'),
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-102', title: 'Cache', description: 'Cache cleanup' } as any
    const project = { agent: {} } as any

    const result = await adapter.runPlan(task, '/tmp/repo', project)

    expect(result.success).toBe(true)
    expect(result.status).toBe(PlanResultStatus.NEEDS_CLARIFICATION)
  })

  it('returns PLAN_FAILED for unknown status payloads', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: '{"status":"UNKNOWN"}',
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-103', title: 'Retry', description: 'Retry flow' } as any
    const project = { agent: {} } as any

    const result = await adapter.runPlan(task, '/tmp/repo', project)

    expect(result.success).toBe(false)
    expect(result.status).toBe(PlanResultStatus.PLAN_FAILED)
    expect(result.error).toContain('Unknown status')
  })

  it('builds codex execution command with model and extra args', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'done' }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-104', title: 'Execution', description: 'Do work' } as any
    const project = {
      agent: {
        model: 'codex-fast',
        approvalMode: 'auto_edit',
        sandbox: true,
        extraArgs: ['--foo', 'bar'],
      },
    } as any

    await adapter.runTask(task, '/tmp/repo', project, 'approved plan')

    const command = mockExecutor.executeCommand.mock.calls[0][0]
    expect(command).toEqual(
      expect.arrayContaining([
        'codex',
        'exec',
        '--model',
        'codex-fast',
        '--full-auto',
        '--foo',
        'bar',
        '--',
      ])
    )
    expect(command[command.length - 1]).toContain('You are executing an implementation plan.')
  })

  it('maps default approval and disabled sandbox to codex runtime flags', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'done' }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = { id: 'task-200', externalId: 'REV-200', title: 'Execution', description: 'Do work' } as any
    const project = {
      agent: {
        approvalMode: 'default',
        sandbox: false,
      },
    } as any

    await adapter.runTask(task, '/tmp/repo', project, 'approved plan')

    const command = mockExecutor.executeCommand.mock.calls[0][0]
    expect(command).toEqual(
      expect.arrayContaining([
        '--dangerously-bypass-approvals-and-sandbox',
      ])
    )
  })

  it('adds codex MCP disable overrides when disableMcp is enabled', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'done' }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = {
      externalId: 'REV-109',
      title: 'Disable MCP',
      description: 'No MCP startup',
    } as any
    const project = {
      agent: {
        disableMcp: true,
      },
    } as any

    await adapter.runTask(task, '/tmp/repo', project, 'Approved plan: remove light mode branches')

    const command = mockExecutor.executeCommand.mock.calls[0][0] as string[]
    expect(command).toEqual(expect.arrayContaining(['-c', 'mcp_servers={}']))
    expect(command).toEqual(
      expect.arrayContaining([
        '-c',
        'features.experimental_use_rmcp_client=false',
        '-c',
        'mcp_servers.linear.enabled=false',
        '-c',
        'mcp_servers.notion.enabled=false',
      ])
    )
  })

  it('parses the last valid JSON payload when output contains multiple JSON blocks', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: [
          '{"status":"PLAN_FAILED","scope":"stale"}',
          'extra non-json text',
          '{"status":"PLAN_READY","scope":"Use latest block","steps":[{"step":1,"action":"go"}]}',
        ].join('\n'),
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = { externalId: 'REV-105', title: 'Multi JSON', description: 'Test parsing' } as any
    const project = { agent: {} } as any

    const result = await adapter.runPlan(task, '/tmp/repo', project)

    expect(result.success).toBe(true)
    expect(result.status).toBe(PlanResultStatus.PLAN_READY)
    expect(result.planMarkdown).toContain('Use latest block')
  })

  it('suppresses JSON fragments from plan stdout logging', async () => {
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({ stream: 'stdout', line: '{' })
        options.onData({ stream: 'stdout', line: '"status": "PLAN_READY",' })
        options.onData({ stream: 'stdout', line: 'Planning task REV-106' })
        options.onData({ stream: 'stdout', line: 'Planning task REV-106' })
        return {
          exitCode: 0,
          output: 'STATUS: PLAN_READY\nSUMMARY: OK\nPLAN:\n- go',
        }
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = {
      externalId: 'REV-106',
      title: 'Log suppression',
      description: 'No JSON spam',
    } as any
    const project = { agent: {} } as any

    await adapter.runPlan(task, '/tmp/repo', project)

    const infoMessages = mockLogger.info.mock.calls.map((call) => call[0])
    const planningMessages = infoMessages.filter((msg: string) => msg === 'Planning task REV-106')
    expect(planningMessages.length).toBe(0)
    expect(infoMessages.some((msg: string) => msg.includes('"status"'))).toBe(false)
  })

  it('fails fast when approved plan contains placeholder steps', async () => {
    const mockExecutor = {
      executeCommand: vi.fn(),
    }

    const adapter = new CodexAdapter(mockExecutor as any, mockLogger as any)
    const task = {
      externalId: 'REV-107',
      title: 'Placeholder plan',
      description: 'Guard execution',
    } as any
    const project = { agent: {} } as any

    const result = await adapter.runTask(task, '/tmp/repo', project, '- Step 1\n- Step 2')

    expect(result.success).toBe(false)
    expect(result.error).toContain('placeholders')
    expect(mockExecutor.executeCommand).not.toHaveBeenCalled()
  })

  it('suppresses codex stderr banner lines', async () => {
    const localLogger = {
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const mockExecutor = {
      executeCommand: vi.fn().mockImplementation(async (_command: string[], options: any) => {
        options.onData({ stream: 'stderr', line: 'OpenAI Codex v0.110.0 (research preview)' })
        options.onData({ stream: 'stderr', line: 'model: gpt-5.3-codex' })
        options.onData({ stream: 'stderr', line: 'actual warning from codex' })
        return { exitCode: 0, output: 'done' }
      }),
    }

    const adapter = new CodexAdapter(mockExecutor as any, localLogger as any)
    const task = {
      id: 'task-108',
      externalId: 'REV-108',
      title: 'Stderr filtering',
      description: 'Noise reduction',
    } as any
    const project = { agent: {} } as any

    await adapter.runTask(task, '/tmp/repo', project, 'real approved steps')

    expect(localLogger.error).not.toHaveBeenCalled()
    expect(localLogger.info).not.toHaveBeenCalledWith(
      'OpenAI Codex v0.110.0 (research preview)',
      task.id
    )
    expect(localLogger.warn).toHaveBeenCalledWith('actual warning from codex', task.id)
  })
})
