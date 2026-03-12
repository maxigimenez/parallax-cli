declare module 'child_process' {
  interface WritableProcessStream {
    end(): void
  }

  interface SpawnedProcess {
    stdin?: WritableProcessStream | null
    stdout: {
      on(event: 'data', listener: (chunk: { toString(): string }) => void): void
    }
    stderr: {
      on(event: 'data', listener: (chunk: { toString(): string }) => void): void
    }
    on(event: 'close', listener: (code: number | null) => void): void
    on(event: 'error', listener: (error: Error) => void): void
  }

  interface SpawnOptions {
    cwd?: string
    env?: Record<string, string | undefined>
    shell?: boolean
    stdio?: 'pipe' | 'ignore' | Array<'pipe' | 'ignore'>
  }

  export function spawn(command: string, args?: string[], options?: SpawnOptions): SpawnedProcess
}

declare const process: {
  env: Record<string, string | undefined>
}

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string
  }
}
