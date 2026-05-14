import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readAgentMemory } from '../../src/ai-adapters/agent-memory'

const originalDataDir = process.env.PARALLAX_DATA_DIR

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.PARALLAX_DATA_DIR
  } else {
    process.env.PARALLAX_DATA_DIR = originalDataDir
  }
})

describe('readAgentMemory', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-memory-'))
    process.env.PARALLAX_DATA_DIR = tmpDir
  })

  it('returns file content when memory.md exists', async () => {
    const agentDir = path.join(tmpDir, 'agents', 'developer')
    await fs.mkdir(agentDir, { recursive: true })
    await fs.writeFile(path.join(agentDir, 'memory.md'), '## Conventions\n- Use pnpm')

    const result = await readAgentMemory('developer')

    expect(result).toBe('## Conventions\n- Use pnpm')
  })

  it('returns undefined when memory.md does not exist', async () => {
    const result = await readAgentMemory('nonexistent-agent')

    expect(result).toBeUndefined()
  })

  it('returns undefined when memory.md is empty', async () => {
    const agentDir = path.join(tmpDir, 'agents', 'developer')
    await fs.mkdir(agentDir, { recursive: true })
    await fs.writeFile(path.join(agentDir, 'memory.md'), '   \n  ')

    const result = await readAgentMemory('developer')

    expect(result).toBeUndefined()
  })

  it('trims leading and trailing whitespace from file content', async () => {
    const agentDir = path.join(tmpDir, 'agents', 'developer')
    await fs.mkdir(agentDir, { recursive: true })
    await fs.writeFile(path.join(agentDir, 'memory.md'), '\n\nSome memory\n\n')

    const result = await readAgentMemory('developer')

    expect(result).toBe('Some memory')
  })

  it('throws for non-ENOENT file system errors', async () => {
    const agentDir = path.join(tmpDir, 'agents', 'broken')
    await fs.mkdir(agentDir, { recursive: true })
    // Create memory.md as a directory so reading it throws EISDIR
    await fs.mkdir(path.join(agentDir, 'memory.md'))

    await expect(readAgentMemory('broken')).rejects.toThrow()
  })
})
