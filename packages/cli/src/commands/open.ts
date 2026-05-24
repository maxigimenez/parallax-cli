import { execSync } from 'node:child_process'
import type { CliContext } from '../types.js'

export async function runOpen(_args: string[], context: CliContext) {
  let url = `http://localhost:9372`

  try {
    const state = await context.loadRunningState()
    url = `http://localhost:${state.uiPort}`
  } catch {
    throw new Error(
      `Parallax is not running. Start it first with 'parallax start', then open: ${url}`
    )
  }

  try {
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start ""'
          : 'xdg-open'
    execSync(`${opener} "${url}"`, { stdio: 'ignore' })
    console.log(`Opened ${url}`)
  } catch {
    console.log(`Dashboard: ${url}`)
  }
}
