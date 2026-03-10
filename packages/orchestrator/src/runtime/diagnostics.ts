import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

const ORCHESTRATOR_STDERR_FILE = 'orchestrator.stderr.log'

function resolveRuntimeDataDir() {
  return process.env.PARALLAX_DATA_DIR ?? path.join(os.homedir(), '.parallax')
}

export function resolveOrchestratorStderrPath() {
  return path.join(resolveRuntimeDataDir(), ORCHESTRATOR_STDERR_FILE)
}

export async function readOrchestratorErrors() {
  try {
    const content = await fs.readFile(resolveOrchestratorStderrPath(), 'utf8')
    const errors = content
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)

    return {
      errors,
      hasErrors: errors.length > 0,
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        errors: [] as string[],
        hasErrors: false,
      }
    }

    throw error
  }
}
