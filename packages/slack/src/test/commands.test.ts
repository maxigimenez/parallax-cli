import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { App } from '@slack/bolt'
import { registerSlashCommands } from '../handlers/commands.js'

type CommandHandler = (args: {
  command: { text: string }
  ack: () => Promise<void>
  respond: (msg: any) => Promise<void>
}) => Promise<void>

function captureHandler(): { app: App; getHandler: () => CommandHandler } {
  let handler: CommandHandler | undefined
  const app = {
    command: (_name: string, fn: CommandHandler) => {
      handler = fn
    },
  } as unknown as App
  return {
    app,
    getHandler: () => {
      if (!handler) {
        throw new Error('handler not registered')
      }
      return handler
    },
  }
}

const API = 'http://localhost:9371'

describe('registerSlashCommands', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replies in-channel for the usage message', async () => {
    const { app, getHandler } = captureHandler()
    registerSlashCommands(app, API)
    const respond = vi.fn().mockResolvedValue(undefined)

    await getHandler()({
      command: { text: '' },
      ack: vi.fn().mockResolvedValue(undefined),
      respond,
    })

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ response_type: 'in_channel' }))
  })

  it('replies in-channel for a successful status check', async () => {
    const { app, getHandler } = captureHandler()
    registerSlashCommands(app, API)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activeTasks: 2 }) })
    )
    const respond = vi.fn().mockResolvedValue(undefined)

    await getHandler()({
      command: { text: 'status' },
      ack: vi.fn().mockResolvedValue(undefined),
      respond,
    })

    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        response_type: 'in_channel',
        text: expect.stringContaining('2 tasks'),
      })
    )
  })

  it('replies in-channel when the orchestrator is unreachable', async () => {
    const { app, getHandler } = captureHandler()
    registerSlashCommands(app, API)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Gateway' }))
    const respond = vi.fn().mockResolvedValue(undefined)

    await getHandler()({
      command: { text: 'status' },
      ack: vi.fn().mockResolvedValue(undefined),
      respond,
    })

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ response_type: 'in_channel' }))
  })
})
