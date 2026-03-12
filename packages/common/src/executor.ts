import { spawn } from 'child_process'

export interface LogChunk {
  stream: 'stdout' | 'stderr'
  line: string
}

export interface ExecutionOptions {
  cwd: string
  onData?: (chunk: LogChunk) => void
  env?: Record<string, string | undefined>
}

export interface LocalExecutor {
  executeCommand(
    cmd: string[],
    options: ExecutionOptions
  ): Promise<{ exitCode: number; output: string; stdout: string; stderr: string }>
}

export class HostExecutor implements LocalExecutor {
  async executeCommand(
    cmd: string[],
    options: ExecutionOptions
  ): Promise<{ exitCode: number; output: string; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const [executable, ...args] = cmd

      // Use literal argv handling so multi-line prompts are not reinterpreted by a shell.
      const child = spawn(executable, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: false,
        stdio: 'pipe',
      })

      let output = ''
      let stdout = ''
      let stderr = ''
      let stdoutBuffer = ''
      let stderrBuffer = ''

      const createHandler = (stream: 'stdout' | 'stderr') => (chunk: { toString(): string }) => {
        const text = chunk.toString().replace(/[\uFFFD]/g, '')
        output += text
        if (stream === 'stdout') {
          stdout += text
        } else {
          stderr += text
        }

        if (!options.onData) {
          return
        }

        if (stream === 'stdout') {
          stdoutBuffer += text
          const lines = stdoutBuffer.split('\n')
          stdoutBuffer = lines.pop() || ''
          for (const line of lines) {
            options.onData({ stream, line })
          }
          return
        }

        stderrBuffer += text
        const lines = stderrBuffer.split('\n')
        stderrBuffer = lines.pop() || ''
        for (const line of lines) {
          options.onData({ stream, line })
        }
      }

      if (child.stdin) {
        child.stdin.end()
      }

      child.stdout.on('data', createHandler('stdout'))
      child.stderr.on('data', createHandler('stderr'))

      child.on('close', (code: number | null) => {
        if (options.onData) {
          if (stdoutBuffer) {
            options.onData({ stream: 'stdout', line: stdoutBuffer })
          }
          if (stderrBuffer) {
            options.onData({ stream: 'stderr', line: stderrBuffer })
          }
        }

        resolve({
          exitCode: code ?? 0,
          output: output.trim(),
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        })
      })

      child.on('error', (err: Error) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({
            exitCode: 127,
            output: `Command not found: ${executable}. Check your PATH or ensure the tool is installed.`,
            stdout: '',
            stderr: '',
          })
          return
        }

        reject(err)
      })
    })
  }
}
