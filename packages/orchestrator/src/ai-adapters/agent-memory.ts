import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export async function readAgentMemory(agentName: string): Promise<string | undefined> {
  const dataDir = process.env.PARALLAX_DATA_DIR
    ? path.resolve(process.env.PARALLAX_DATA_DIR)
    : path.join(os.homedir(), '.parallax')

  const memoryPath = path.join(dataDir, 'agents', agentName, 'memory.md')
  try {
    const content = await fs.readFile(memoryPath, 'utf-8')
    const trimmed = content.trim()
    return trimmed || undefined
  } catch (error: any) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}
