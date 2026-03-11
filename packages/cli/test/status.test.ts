import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliContext, RunningState } from '../src/types.js'

const { sleepMock, startSpinnerMock, isProcessAliveMock } = vi.hoisted(() => ({
  sleepMock: vi.fn().mockResolvedValue(undefined),
  startSpinnerMock: vi.fn(),
  isProcessAliveMock: vi.fn(),
}))

vi.mock('@parallax/common', () => ({
  sleep: sleepMock,
}))

vi.mock('../src/process.js', () => ({
  startSpinner: startSpinnerMock,
  isProcessAlive: isProcessAliveMock,
}))

import { runStatus } from '../src/commands/status.js'

function createContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    defaultApiBase: 'http://localhost:3000',
    defaultDataDir: '/tmp/.parallax',
    manifestFile: 'running.json',
    registryFile: 'registry.json',
    rootDir: '/tmp/parallax',
    cliVersion: '0.0.5',
    packageVersion: '0.0.5',
    resolvePath: (raw) => raw,
    ensureFileExists: async () => true,
    loadRunningState: async () => {
      throw new Error('offline')
    },
    loadRegistry: async () => ({ configs: [] }),
    saveRegistry: async () => {},
    resolveDefaultApiBase: async () => 'http://localhost:3000',
    validateConfigFile: async () => {},
    buildEnvConfig: () => ({}),
    ...overrides,
  }
}

function createRunningState(overrides: Partial<RunningState> = {}): RunningState {
  return {
    startedAt: Date.now(),
    orchestratorPid: 1234,
    uiPid: 5678,
    apiPort: 3000,
    uiPort: 8080,
    ...overrides,
  }
}

describe('runStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    startSpinnerMock.mockReturnValue({ stop: vi.fn() })
    isProcessAliveMock.mockReturnValue(true)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('prints offline status when no running state exists', async () => {
    const events: string[] = []
    const spinnerStop = vi.fn(() => events.push('spinner-stop'))
    startSpinnerMock.mockImplementation((message: string) => {
      events.push(`spinner-start:${message}`)
      return { stop: spinnerStop }
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      events.push(`log:${String(value ?? '')}`)
    })

    await runStatus([], createContext())

    expect(events[0]).toBe('spinner-start:Checking Parallax status...')
    expect(events[1]).toBe('spinner-stop')
    expect(events[2]).toBe('log:')
    expect(events[3]).toContain('Parallax status: offline.')
    expect(events[4]).toContain('parallax start')
    expect(logSpy).toHaveBeenCalled()
  })

  it('prints healthy status when runtime is up and diagnostics are clean', async () => {
    const stop = vi.fn()
    startSpinnerMock.mockReturnValue({ stop })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hasErrors: false, errors: [] }),
      })
    )

    await runStatus(
      [],
      createContext({
        loadRunningState: async () => createRunningState(),
      })
    )

    expect(startSpinnerMock).toHaveBeenCalledWith('Checking Parallax status...')
    expect(isProcessAliveMock).toHaveBeenCalledWith(1234)
    expect(isProcessAliveMock).toHaveBeenCalledWith(5678)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/runtime/errors')
    expect(stop).toHaveBeenCalledOnce()
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      '',
      expect.stringContaining('Parallax status: healthy.'),
      expect.stringContaining('Orchestrator PID:'),
      expect.stringContaining('Dashboard:'),
    ])
  })

  it('prints diagnostics when orchestrator errors are present', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hasErrors: true,
          errors: ['first error', 'second error'],
        }),
      })
    )

    await runStatus(
      [],
      createContext({
        loadRunningState: async () => createRunningState({ uiPid: undefined }),
      })
    )

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      '',
      expect.stringContaining('Parallax status: issues detected.'),
      expect.stringContaining('Orchestrator PID:'),
      expect.stringContaining('Dashboard:'),
      '',
      'first error',
      'second error',
    ])
  })
})
