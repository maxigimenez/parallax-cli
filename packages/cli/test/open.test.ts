import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CliContext } from '../src/types.js'

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execSync: execSyncMock,
}))

import { runOpen } from '../src/commands/open.js'

function createContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    defaultApiBase: 'http://localhost:3000',
    defaultDataDir: '/tmp/.parallax',
    manifestFile: 'running.json',
    rootDir: '/tmp/parallax',
    cliVersion: '0.0.1',
    packageVersion: '0.0.1',
    resolvePath: (raw) => raw,
    ensureFileExists: async () => true,
    loadRunningState: async () => ({
      startedAt: Date.now(),
      orchestratorPid: 1,
      apiPort: 3000,
      uiPort: 8080,
    }),
    loadStoredConfig: async () => ({
      version: 1,
      projects: [],
      agents: [],
      slack: null,
      secrets: {},
      updatedAt: 0,
    }),
    saveStoredConfig: async () => {},
    resolveDefaultApiBase: async () => 'http://localhost:3000',
    buildEnvConfig: () => ({}),
    ...overrides,
  }
}

describe('runOpen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('throws when Parallax is not running', async () => {
    const context = createContext({
      loadRunningState: async () => {
        throw new Error('not found')
      },
    })

    await expect(runOpen([], context)).rejects.toThrow(
      "Parallax is not running. Start it first with 'parallax start'"
    )
  })

  it('opens the URL from running state', async () => {
    execSyncMock.mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runOpen([], createContext())

    expect(execSyncMock).toHaveBeenCalledOnce()
    const cmd = execSyncMock.mock.calls[0][0] as string
    expect(cmd).toContain('"http://localhost:8080"')
    expect(logSpy).toHaveBeenCalledWith('Opened http://localhost:8080')
  })

  it('uses uiPort from running state', async () => {
    execSyncMock.mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runOpen(
      [],
      createContext({
        loadRunningState: async () => ({
          startedAt: Date.now(),
          orchestratorPid: 1,
          apiPort: 3001,
          uiPort: 9999,
        }),
      })
    )

    const cmd = execSyncMock.mock.calls[0][0] as string
    expect(cmd).toContain('"http://localhost:9999"')
  })

  it('falls back to printing URL when browser open fails', async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('open failed')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runOpen([], createContext())

    expect(logSpy).toHaveBeenCalledWith('Dashboard: http://localhost:8080')
  })
})
