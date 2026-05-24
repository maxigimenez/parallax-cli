import type { CliContext } from '../types.js'

type TaskEntry = {
  id: string
  externalId: string
  title: string
  status: string
  projectId: string
  createdAt: number
}

type ProjectEntry = {
  id: string
  agent: { provider: string; model?: string }
}

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function colorStatus(status: string): string {
  switch (status) {
    case 'done':
      return `${GREEN}${status}${RESET}`
    case 'running':
      return `${CYAN}${status}${RESET}`
    case 'queued':
      return `${YELLOW}${status}${RESET}`
    case 'failed':
      return `${RED}${status}${RESET}`
    case 'canceled':
      return `${DIM}${status}${RESET}`
    default:
      return status
  }
}

export async function runTasks(_args: string[], context: CliContext) {
  let apiBase: string
  try {
    apiBase = await context.resolveDefaultApiBase()
  } catch {
    throw new Error("Parallax is not running. Start it first with 'parallax start'.")
  }

  const [tasksRes, configRes] = await Promise.all([
    fetch(`${apiBase}/tasks`),
    fetch(`${apiBase}/config`),
  ])

  if (!tasksRes.ok) {
    throw new Error(`Failed to fetch tasks (${tasksRes.status}): ${tasksRes.statusText}`)
  }
  if (!configRes.ok) {
    throw new Error(`Failed to fetch config (${configRes.status}): ${configRes.statusText}`)
  }

  const allTasks = (await tasksRes.json()) as TaskEntry[]
  const config = (await configRes.json()) as { projects?: ProjectEntry[] }
  const projects = new Map((config.projects ?? []).map((p) => [p.id, p]))

  const tasks = allTasks
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)

  if (tasks.length === 0) {
    console.log('No tasks found.')
    return
  }

  const rows = tasks.map((task) => {
    const project = projects.get(task.projectId)
    const provider = project?.agent.provider ?? '—'
    const model = project?.agent.model ?? '—'
    const displayId = task.externalId || task.id
    const title = task.title.length > 50 ? task.title.slice(0, 47) + '...' : task.title
    return { id: displayId, title, provider, model, status: task.status }
  })

  const colWidths = {
    id: Math.max(7, ...rows.map((r) => r.id.length)),
    title: Math.max(5, ...rows.map((r) => r.title.length)),
    provider: Math.max(8, ...rows.map((r) => r.provider.length)),
    model: Math.max(5, ...rows.map((r) => r.model.length)),
    status: Math.max(6, ...rows.map((r) => r.status.length)),
  }

  const pad = (s: string, n: number) => s.padEnd(n)

  const header = [
    pad('TASK ID', colWidths.id),
    pad('NAME', colWidths.title),
    pad('ADAPTER', colWidths.provider),
    pad('MODEL', colWidths.model),
    pad('STATUS', colWidths.status),
  ].join('  ')

  const divider = [
    '─'.repeat(colWidths.id),
    '─'.repeat(colWidths.title),
    '─'.repeat(colWidths.provider),
    '─'.repeat(colWidths.model),
    '─'.repeat(colWidths.status),
  ].join('  ')

  console.log()
  console.log(`${BOLD}${header}${RESET}`)
  console.log(`${DIM}${divider}${RESET}`)

  for (const row of rows) {
    console.log(
      [
        pad(row.id, colWidths.id),
        pad(row.title, colWidths.title),
        pad(row.provider, colWidths.provider),
        pad(row.model, colWidths.model),
        colorStatus(row.status),
      ].join('  ')
    )
  }

  console.log()
}
