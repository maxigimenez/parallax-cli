import { beforeEach, describe, expect, it, vi } from 'vitest'
import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import type { CliContext } from '../src/types.js'

const stopLoop = new Error('stop loop')

const { sleepMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(),
}))

vi.mock('@parallax/common', () => ({
  sleep: sleepMock,
}))

import { formatLogLine, runLogs } from '../src/commands/logs.js'

function createContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    defaultApiBase: 'http://localhost:3000',
    defaultDataDir: '/tmp/.parallax',
    manifestFile: 'running.json',
    registryFile: 'registry.json',
    rootDir: '/tmp/parallax',
    cliVersion: '0.0.8',
    packageVersion: '0.0.8',
    resolvePath: (raw) => raw,
    ensureFileExists: async () => true,
    loadRunningState: async () => ({
      startedAt: Date.now(),
      orchestratorPid: 1,
      apiPort: 3000,
      uiPort: 8080,
    }),
    loadRegistry: async () => ({ configs: [] }),
    saveRegistry: async () => {},
    resolveDefaultApiBase: async () => 'http://localhost:3000',
    validateConfigFile: async () => {},
    buildEnvConfig: () => ({}),
    ...overrides,
  }
}

describe('runLogs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('starts tailing from the current time instead of replaying old logs', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    sleepMock.mockRejectedValue(stopLoop)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [] }),
    } as Response)

    await expect(runLogs([], createContext())).rejects.toBe(stopLoop)

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/logs?since=5000&limit=500')
  })

  it('prints only new entries once while preserving the existing output shape', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    sleepMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(stopLoop)

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          logs: [
            {
              taskExternalId: 'old-task',
              level: 'info',
              icon: 'ℹ',
              message: 'should be skipped',
              timestamp: 4_999,
            },
            {
              taskExternalId: 'task-1',
              level: 'warning',
              icon: '⚠',
              message: 'first fresh log',
              timestamp: 5_000,
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          logs: [
            {
              taskExternalId: 'task-1',
              level: 'warning',
              icon: '⚠',
              message: 'first fresh log',
              timestamp: 5_000,
            },
            {
              taskExternalId: 'task-2',
              level: 'error',
              icon: '✖',
              message: 'second fresh log',
              timestamp: 5_001,
            },
          ],
        }),
      } as Response)

    await expect(runLogs([], createContext())).rejects.toBe(stopLoop)

    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(stripAnsi(String(logSpy.mock.calls[0]?.[0]))).toBe(
      '1970-01-01T00:00:05.000Z [task-1] WARNING ⚠ first fresh log'
    )
    expect(stripAnsi(String(logSpy.mock.calls[1]?.[0]))).toBe(
      '1970-01-01T00:00:05.001Z [task-2] ERROR ✖ second fresh log'
    )
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:3000/logs?since=5000&limit=500')
  })

  it('applies severity-based ANSI styling without changing the readable text', () => {
    const colors = new chalk.Instance({ level: 1 })
    const line = formatLogLine(
      {
        taskExternalId: 'task-9',
        level: 'warning',
        icon: '⚠',
        message: 'needs attention',
        timestamp: 5_000,
      },
      colors
    )

    expect(stripAnsi(line)).toBe('1970-01-01T00:00:05.000Z [task-9] WARNING ⚠ needs attention')
    expect(line).not.toBe(stripAnsi(line))
  })
})
