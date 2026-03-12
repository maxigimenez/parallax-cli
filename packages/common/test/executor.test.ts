import { EventEmitter } from 'node:events'
import { Writable, Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { HostExecutor } from '../src/executor'

class MockWritable extends Writable {
  endSpy = vi.fn()

  override _write(
    _chunk: any,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    callback()
  }

  override end(...args: any[]) {
    this.endSpy(...args)
    return super.end(...args)
  }
}

class MockChildProcess extends EventEmitter {
  stdin = new MockWritable()
  stdout = new Readable({ read() {} })
  stderr = new Readable({ read() {} })
}

afterEach(() => {
  vi.restoreAllMocks()
  spawnMock.mockReset()
})

describe('HostExecutor', () => {
  it('closes stdin for non-interactive child processes', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const executor = new HostExecutor()
    const execution = executor.executeCommand(['echo', 'ok'], {
      cwd: '/tmp',
    })

    setTimeout(() => {
      child.emit('close', 0)
    }, 0)

    await execution

    expect(spawnMock).toHaveBeenCalledWith(
      'echo',
      ['ok'],
      expect.objectContaining({
        cwd: '/tmp',
        shell: false,
        stdio: 'pipe',
      })
    )
    expect(child.stdin.endSpy).toHaveBeenCalledTimes(1)
  })
})
