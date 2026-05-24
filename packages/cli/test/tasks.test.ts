import { beforeEach, describe, expect, it, vi } from 'vitest'
import stripAnsi from 'strip-ansi'
import type { CliContext } from '../src/types.js'

import { runTasks } from '../src/commands/tasks.js'

function createContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    defaultApiBase: 'http://localhost:9371',
    defaultDataDir: '/tmp/.parallax',
    manifestFile: 'running.json',
    rootDir: '/tmp/parallax',
    cliVersion: '0.0.9',
    packageVersion: '0.0.9',
    resolvePath: (raw) => raw,
    ensureFileExists: async () => true,
    loadRunningState: async () => ({
      startedAt: Date.now(),
      orchestratorPid: 1234,
      uiPid: 5678,
      apiPort: 9371,
      uiPort: 9372,
    }),
    loadStoredConfig: async () => ({
      version: 1,
      projects: [],
      slack: null,
      secrets: {},
      updatedAt: 0,
    }),
    saveStoredConfig: async () => {},
    resolveDefaultApiBase: async () => 'http://localhost:9371',
    buildEnvConfig: () => ({}),
    ...overrides,
  }
}

function makeFetch(tasks: unknown[], projects: unknown[] = []) {
  return vi.fn().mockImplementation((url: string) => {
    if (String(url).endsWith('/tasks')) {
      return Promise.resolve({ ok: true, json: async () => tasks })
    }
    if (String(url).endsWith('/config')) {
      return Promise.resolve({ ok: true, json: async () => ({ projects }) })
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })
  })
}

describe('runTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('throws when orchestrator is not running', async () => {
    const context = createContext({
      resolveDefaultApiBase: async () => {
        throw new Error('no manifest')
      },
    })

    await expect(runTasks([], context)).rejects.toThrow(
      "Parallax is not running. Start it first with 'parallax start'."
    )
  })

  it('prints "No tasks found." when the API returns an empty list', async () => {
    vi.stubGlobal('fetch', makeFetch([], []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    expect(logSpy).toHaveBeenCalledWith('No tasks found.')
  })

  it('renders a table with task id, name, adapter, model, and status columns', async () => {
    const tasks = [
      {
        id: 'internal-1',
        externalId: 'PROJ-42',
        title: 'Fix the login bug',
        status: 'running',
        projectId: 'proj-a',
        createdAt: 1000,
      },
    ]
    const projects = [
      { id: 'proj-a', agent: { provider: 'claude-code', model: 'claude-sonnet-4-5' } },
    ]

    vi.stubGlobal('fetch', makeFetch(tasks, projects))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const lines = logSpy.mock.calls.map((call) => stripAnsi(String(call[0])))
    const header = lines.find((l) => l.includes('TASK ID'))
    const row = lines.find((l) => l.includes('PROJ-42'))

    expect(header).toBeDefined()
    expect(header).toContain('NAME')
    expect(header).toContain('ADAPTER')
    expect(header).toContain('MODEL')
    expect(header).toContain('STATUS')

    expect(row).toBeDefined()
    expect(row).toContain('PROJ-42')
    expect(row).toContain('Fix the login bug')
    expect(row).toContain('claude-code')
    expect(row).toContain('claude-sonnet-4-5')
    expect(row).toContain('running')
  })

  it('uses the internal id when externalId is empty', async () => {
    const tasks = [
      {
        id: 'internal-abc',
        externalId: '',
        title: 'Some task',
        status: 'queued',
        projectId: 'proj-b',
        createdAt: 1000,
      },
    ]

    vi.stubGlobal('fetch', makeFetch(tasks, []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const lines = logSpy.mock.calls.map((call) => stripAnsi(String(call[0])))
    expect(lines.some((l) => l.includes('internal-abc'))).toBe(true)
  })

  it('shows a dash for adapter and model when no matching project exists', async () => {
    const tasks = [
      {
        id: 'internal-1',
        externalId: 'PROJ-1',
        title: 'Orphan task',
        status: 'done',
        projectId: 'unknown-project',
        createdAt: 1000,
      },
    ]

    vi.stubGlobal('fetch', makeFetch(tasks, []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const lines = logSpy.mock.calls.map((call) => stripAnsi(String(call[0])))
    const row = lines.find((l) => l.includes('PROJ-1'))
    expect(row).toBeDefined()
    expect(row).toContain('—')
  })

  it('limits output to the 20 most recent tasks by createdAt', async () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      externalId: `TASK-${i}`,
      title: `Task ${i}`,
      status: 'done',
      projectId: 'proj-a',
      createdAt: i,
    }))

    vi.stubGlobal('fetch', makeFetch(tasks, []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const lines = logSpy.mock.calls.map((call) => stripAnsi(String(call[0])))
    const taskRows = lines.filter((l) => l.includes('TASK-'))
    expect(taskRows).toHaveLength(20)
    expect(taskRows.some((l) => l.includes('TASK-24'))).toBe(true)
    expect(taskRows.some((l) => l.includes('TASK-4'))).toBe(false)
  })

  it('truncates titles longer than 50 characters', async () => {
    const longTitle = 'A'.repeat(60)
    const tasks = [
      {
        id: 'id-1',
        externalId: 'TASK-1',
        title: longTitle,
        status: 'running',
        projectId: 'proj-a',
        createdAt: 1000,
      },
    ]

    vi.stubGlobal('fetch', makeFetch(tasks, []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const lines = logSpy.mock.calls.map((call) => stripAnsi(String(call[0])))
    const row = lines.find((l) => l.includes('TASK-1'))
    expect(row).toBeDefined()
    expect(row).toContain('...')
    expect(row).not.toContain(longTitle)
  })

  it('applies ANSI color codes to the status column', async () => {
    const statuses = ['done', 'running', 'queued', 'failed', 'canceled']
    const tasks = statuses.map((status, i) => ({
      id: `id-${i}`,
      externalId: `TASK-${i}`,
      title: `Task ${i}`,
      status,
      projectId: 'proj-a',
      createdAt: i,
    }))

    vi.stubGlobal('fetch', makeFetch(tasks, []))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runTasks([], createContext())

    const rawLines = logSpy.mock.calls.map((call) => String(call[0]))
    const stripped = rawLines.map(stripAnsi)

    const taskRows = rawLines.filter((_, i) => {
      const plain = stripped[i]
      return plain !== undefined && statuses.some((s) => plain.includes(s) && plain.includes('TASK-'))
    })

    for (const row of taskRows) {
      expect(row).not.toBe(stripAnsi(row))
    }
  })

  it('throws when the tasks endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).endsWith('/tasks')) {
          return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' })
        }
        return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) })
      })
    )

    await expect(runTasks([], createContext())).rejects.toThrow('Failed to fetch tasks (500)')
  })
})
