import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  SQLITE_FLAG,
  candidateNodePaths,
  currentRuntimeIsCapable,
  probeNode,
  readRecordedNode,
  recordNode,
  resolveRunnerNode,
  unsupportedRuntimeMessage,
} from '../src/node-runtime.js'

let dataDir = ''

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'px-runtime-'))
})

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

describe('capability probing', () => {
  it('reports the test runner itself as capable', () => {
    // The suite runs on a supported Node, so this doubles as a check that the
    // probe works at all in ESM -- where a bare `require` would always throw.
    expect(currentRuntimeIsCapable()).toBe(true)
  })

  it('does not leave process.emitWarning patched', () => {
    const before = process.emitWarning
    currentRuntimeIsCapable()
    expect(process.emitWarning).toBe(before)
  })

  it('accepts the interpreter running these tests', () => {
    expect(probeNode(process.execPath)).toBe(true)
  })

  it('rejects something that is not a node binary', () => {
    expect(probeNode('/bin/echo')).toBe(false)
  })

  it('rejects a path that does not exist, without throwing', () => {
    expect(probeNode('/nonexistent/node')).toBe(false)
  })

  it('passes the sqlite flag, which Node 22 needs and later versions ignore', () => {
    expect(SQLITE_FLAG).toBe('--experimental-sqlite')
  })
})

describe('candidate discovery', () => {
  it('includes the current interpreter and only real files', () => {
    const candidates = candidateNodePaths(dataDir)

    expect(candidates).toContain(process.execPath)
    for (const candidate of candidates) {
      expect(fsSync.statSync(candidate).isFile()).toBe(true)
    }
  })

  it('puts a previously recorded interpreter first', () => {
    recordNode(dataDir, { binary: process.execPath, version: process.version })
    expect(candidateNodePaths(dataDir)[0]).toBe(process.execPath)
  })

  it('does not repeat a candidate reachable by two routes', () => {
    recordNode(dataDir, { binary: process.execPath, version: process.version })
    const candidates = candidateNodePaths(dataDir)
    expect(new Set(candidates).size).toBe(candidates.length)
  })
})

describe('recording the choice', () => {
  it('round-trips', () => {
    recordNode(dataDir, { binary: process.execPath, version: 'v24.0.0' })
    expect(readRecordedNode(dataDir)).toBe(process.execPath)
  })

  it('ignores a record pointing at an interpreter that has been removed', () => {
    fsSync.writeFileSync(
      path.join(dataDir, 'node-runtime.json'),
      JSON.stringify({ binary: '/gone/node' })
    )
    // A version manager pruning old versions must not pin us to a dead path.
    expect(readRecordedNode(dataDir)).toBeUndefined()
  })

  it('ignores a corrupt record', () => {
    fsSync.writeFileSync(path.join(dataDir, 'node-runtime.json'), 'not json')
    expect(readRecordedNode(dataDir)).toBeUndefined()
  })

  it('returns undefined before anything is recorded', () => {
    expect(readRecordedNode(dataDir)).toBeUndefined()
  })
})

describe('resolveRunnerNode', () => {
  it('returns an absolute interpreter path and remembers it', () => {
    const runtime = resolveRunnerNode(dataDir)

    expect(path.isAbsolute(runtime.binary)).toBe(true)
    expect(probeNode(runtime.binary)).toBe(true)
    // Recording it is what keeps a long-running daemon on the same interpreter.
    expect(readRecordedNode(dataDir)).toBe(runtime.binary)
  })
})

describe('unsupportedRuntimeMessage', () => {
  it('names the offending version and how to fix it', () => {
    const message = unsupportedRuntimeMessage()
    expect(message).toContain(process.version)
    expect(message).toContain('node:sqlite')
    expect(message).toContain('nvm install 24')
  })

  it('distinguishes giving up after a re-exec from finding nothing', () => {
    expect(unsupportedRuntimeMessage(false)).toContain('No usable Node was found')
    expect(unsupportedRuntimeMessage(true)).toContain('already switched interpreters once')
  })
})
