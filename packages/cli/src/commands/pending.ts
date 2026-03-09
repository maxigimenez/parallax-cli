import { parsePendingOptions } from '../args.js'
import type { CliContext, TaskPendingState } from '../types.js'

export function scopePendingTasks(
  tasks: TaskPendingState[],
  allowedProjectIds: Set<string> | undefined
): TaskPendingState[] {
  if (!allowedProjectIds) {
    return tasks
  }

  return tasks.filter((task) => {
    if (!task.projectId) {
      throw new Error(`Pending task ${task.id} has no projectId. Cannot apply project-level scope.`)
    }

    return allowedProjectIds.has(task.projectId)
  })
}

export function resolveApproveTargets(tasks: TaskPendingState[], approveValue: string): string[] {
  const available = new Set(tasks.map((task) => task.id))
  if (approveValue === 'all') {
    if (tasks.length === 0) {
      throw new Error('No pending plans available to approve.')
    }
    return [...available]
  }

  const explicit = approveValue.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (explicit.length === 0) {
    throw new Error('approve value must include at least one task id.')
  }

  const unknown = explicit.filter((id) => !available.has(id))
  if (unknown.length > 0) {
    throw new Error(`Unknown task id(s): ${unknown.join(', ')}`)
  }

  return explicit
}

export function resolveRejectTarget(tasks: TaskPendingState[], rejectId: string): string {
  const available = new Set(tasks.map((task) => task.id))
  if (!available.has(rejectId)) {
    throw new Error(`Unknown task id: ${rejectId}`)
  }

  return rejectId
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }
}

function printPendingSummary(tasks: TaskPendingState[]) {
  for (const task of tasks) {
    console.log(`- ${task.id} | project=${task.projectId} | plan=${task.planState} | agent=${task.lastAgent ?? 'n/a'}`)
    console.log(`  title: ${task.title ?? '(no title)'}`)
    const snippet = task.planMarkdown ?? task.planResult
    if (snippet) {
      const cleaned = snippet.replace(/\s+/g, ' ').trim()
      console.log(`  plan: ${cleaned.slice(0, 280)}${cleaned.length > 280 ? '...' : ''}`)
    }
  }
}

export async function runPending(args: string[], context: CliContext) {
  const options = parsePendingOptions(args)
  const configPath = options.configPath ? context.resolvePath(options.configPath) : undefined
  const apiBase = options.apiBase || (await context.resolveDefaultApiBase(configPath))

  const pendingTasks = await fetchJson<TaskPendingState[]>(`${apiBase}/tasks/pending-plans`)
  const allowedProjectIds = await context.resolveProjectIdsForPending(configPath)
  const scopedTasks = scopePendingTasks(pendingTasks, allowedProjectIds)

  if (options.approve) {
    const approvedIds = resolveApproveTargets(scopedTasks, options.approve)
    for (const taskId of approvedIds) {
      await postJson(`${apiBase}/tasks/${encodeURIComponent(taskId)}/approve`, {
        approver: options.approver,
      })
      console.log(`Approved: ${taskId}`)
    }
    return
  }

  if (options.reject) {
    const rejectedId = resolveRejectTarget(scopedTasks, options.reject)
    await postJson(`${apiBase}/tasks/${encodeURIComponent(rejectedId)}/reject`, {})
    console.log(`Rejected: ${rejectedId}`)
    return
  }

  if (options.json) {
    console.log(JSON.stringify(scopedTasks, null, 2))
    return
  }

  if (scopedTasks.length === 0) {
    console.log('No pending plans right now.')
    return
  }

  printPendingSummary(scopedTasks)
  console.log(
    '\nApprove/reject with:\n  parallax pending --approve <id|all>\n  parallax pending --reject <id>'
  )
}
