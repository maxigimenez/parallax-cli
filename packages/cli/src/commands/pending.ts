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
  const normalized = approveValue.trim()
  if (!normalized) {
    throw new Error('approve value must include a task id.')
  }

  if (normalized.includes(',')) {
    throw new Error('Approve accepts a single task id.')
  }

  if (!available.has(normalized)) {
    throw new Error(`Unknown task id: ${normalized}`)
  }

  return [normalized]
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
    console.log(
      `- ${task.id} | project=${task.projectId} | plan=${task.planState} | agent=${task.lastAgent ?? 'n/a'}`
    )
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
  const apiBase = await context.resolveDefaultApiBase()

  const pendingTasks = await fetchJson<TaskPendingState[]>(`${apiBase}/tasks/pending-plans`)
  const scopedTasks = pendingTasks

  if (options.approve) {
    const approvedIds = resolveApproveTargets(scopedTasks, options.approve)
    for (const taskId of approvedIds) {
      await postJson(`${apiBase}/tasks/${encodeURIComponent(taskId)}/approve`, {})
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

  if (scopedTasks.length === 0) {
    console.log('No pending plans right now.')
    return
  }

  printPendingSummary(scopedTasks)
  console.log(
    '\nApprove/reject with:\n  parallax pending --approve <id>\n  parallax pending --reject <id>'
  )
}
