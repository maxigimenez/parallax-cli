import path from 'node:path'
import fs from 'node:fs/promises'

export const RUNNER_STDERR_FILE = 'runner.stderr.log'
export const RUNNER_STDOUT_FILE = 'runner.stdout.log'

export function runnerStderrPath(dataDir: string): string {
  return path.join(dataDir, RUNNER_STDERR_FILE)
}

export async function readRunnerErrors(
  dataDir: string,
  maxLines = 200
): Promise<{ errors: string[]; hasErrors: boolean }> {
  try {
    const content = await fs.readFile(runnerStderrPath(dataDir), 'utf8')
    const errors = content
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .slice(-maxLines)
    return { errors, hasErrors: errors.length > 0 }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { errors: [], hasErrors: false }
    }
    throw error
  }
}
