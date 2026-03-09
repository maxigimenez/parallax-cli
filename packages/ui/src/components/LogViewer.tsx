import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AppConfig, TaskPlanState } from '@parallax/common'
import { planActionsState, resolveProjectProvider } from '@/lib/task-helpers'
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/task-constants'

const MIN_ACTION_DELAY_MS = 400
const ACTION_ACCENT_CLASS = 'border-orange-700 bg-orange-950/30 text-orange-200'

const STATUS_ACCENT_CLASS: Record<TaskStatus, string> = {
  [TASK_STATUS.QUEUED]: 'text-zinc-300',
  [TASK_STATUS.RUNNING]: 'text-sky-300',
  [TASK_STATUS.CANCELED]: 'text-amber-300',
  [TASK_STATUS.FAILED]: 'text-red-300',
  [TASK_STATUS.DONE]: 'text-emerald-300',
}

const STATUS_DOT_CLASS: Record<TaskStatus, string> = {
  [TASK_STATUS.QUEUED]: 'bg-zinc-500',
  [TASK_STATUS.RUNNING]: 'bg-sky-500',
  [TASK_STATUS.CANCELED]: 'bg-amber-500',
  [TASK_STATUS.FAILED]: 'bg-red-500',
  [TASK_STATUS.DONE]: 'bg-emerald-500',
}

async function withMinimumDelay(action: () => Promise<void>) {
  const startedAt = Date.now()
  await action()
  const remainingDelay = MIN_ACTION_DELAY_MS - (Date.now() - startedAt)
  if (remainingDelay > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, remainingDelay)
    })
  }
}

interface LogViewerProps {
  taskId: string
  title?: string
  msg?: string
  description?: string
  projectId?: string
  logs: Array<{
    message: string
    icon: string
    level: 'info' | 'warning' | 'error' | 'debug'
    timestamp: number
  }>
  status: TaskStatus
  branchName?: string
  prUrl?: string
  planState?: TaskPlanState
  planMarkdown?: string
  planPrompt?: string
  planResult?: string
  config: AppConfig | null
  onRetry?: (taskId: string) => Promise<void>
  onCancel?: (taskId: string) => Promise<void>
  onApprovePlan?: (taskId: string, approver?: string, planMarkdown?: string) => Promise<void>
  onRejectPlan?: (taskId: string) => Promise<void>
  activeTab: 'summary' | 'logs' | 'plan'
  onTabChange: (tab: 'summary' | 'logs' | 'plan') => void
}

export function LogViewer({
  taskId,
  title,
  msg,
  description,
  projectId,
  logs,
  status,
  branchName,
  prUrl,
  planState,
  planMarkdown,
  planPrompt,
  planResult,
  config,
  onRetry,
  onCancel,
  onApprovePlan,
  onRejectPlan,
  activeTab,
  onTabChange,
}: LogViewerProps) {
  const [activeLevel, setActiveLevel] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>(
    'all'
  )
  const [editablePlan, setEditablePlan] = useState((planMarkdown || planResult || planPrompt || '').trim())
  const [approvePending, setApprovePending] = useState(false)
  const [rejectPending, setRejectPending] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)

  const provider = resolveProjectProvider(config, projectId)
  const actionGuard = planActionsState(planState)
  const isActionPending = approvePending || rejectPending || retryPending || cancelPending
  const planActionsDisabledByStatus =
    status === TASK_STATUS.CANCELED || status === TASK_STATUS.FAILED
  const canEditPlan = actionGuard.canEdit && !planActionsDisabledByStatus && !isActionPending

  useEffect(() => {
    setEditablePlan((planMarkdown || planResult || planPrompt || '').trim())
    setApprovePending(false)
    setRejectPending(false)
    setRetryPending(false)
    setCancelPending(false)
  }, [taskId, planMarkdown, planPrompt, planResult])

  const filteredLogs = useMemo(() => {
    if (activeLevel === 'all') {
      return logs
    }
    return logs.filter((entry) => entry.level === activeLevel)
  }, [activeLevel, logs])

  const onApprove = async () => {
    if (!onApprovePlan || !canEditPlan) {
      return
    }
    setApprovePending(true)
    try {
      await withMinimumDelay(() => onApprovePlan(taskId, 'operator', editablePlan))
    } finally {
      setApprovePending(false)
    }
  }

  const onReject = async () => {
    if (!onRejectPlan || !canEditPlan) {
      return
    }
    setRejectPending(true)
    try {
      await withMinimumDelay(() => onRejectPlan(taskId))
    } finally {
      setRejectPending(false)
    }
  }

  const onRetryClick = async () => {
    if (!onRetry || retryPending) {
      return
    }
    setRetryPending(true)
    try {
      await withMinimumDelay(() => onRetry(taskId))
    } finally {
      setRetryPending(false)
    }
  }

  const onCancelClick = async () => {
    if (!onCancel || cancelPending) {
      return
    }
    setCancelPending(true)
    try {
      await withMinimumDelay(() => onCancel(taskId))
    } finally {
      setCancelPending(false)
    }
  }

  const planActionPending = approvePending || rejectPending
  const canCancel =
    (status === TASK_STATUS.QUEUED || status === TASK_STATUS.RUNNING) &&
    Boolean(onCancel) &&
    !isActionPending
  const canRetry =
    (status === TASK_STATUS.FAILED || status === TASK_STATUS.CANCELED) &&
    Boolean(onRetry) &&
    !isActionPending
  const cancelReason = canCancel ? '' : 'Cancel is only available for queued or running tasks.'
  const retryReason = canRetry ? '' : 'Retry is available only for failed or canceled tasks.'

  return (
    <div className="flex h-full flex-1 flex-col bg-[#060606]">
      <div className="border-b border-zinc-800 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{taskId}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {title || description || 'No task summary available.'}
            </p>
          </div>
          <TooltipProvider>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!canRetry}
                    onClick={onRetryClick}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {retryPending ? 'Retrying...' : 'Retry'}
                  </button>
                </TooltipTrigger>
                {!canRetry && <TooltipContent>{retryReason}</TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!canCancel}
                    onClick={onCancelClick}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {cancelPending ? 'Cancelling...' : 'Cancel'}
                  </button>
                </TooltipTrigger>
                {!canCancel && <TooltipContent>{cancelReason}</TooltipContent>}
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as 'summary' | 'logs' | 'plan')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-zinc-800 px-6 py-3">
          <TabsList className="grid h-8 w-[260px] grid-cols-3 bg-zinc-900 p-0.5">
            <TabsTrigger value="summary" className="h-6 px-2 text-xs">
              Summary
            </TabsTrigger>
            <TabsTrigger value="logs" className="h-6 px-2 text-xs">
              Logs
            </TabsTrigger>
            <TabsTrigger value="plan" className="h-6 px-2 text-xs">
              Plan
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="summary" className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-3 text-sm">
            <SummaryRow label="Source Provider" value={provider} />
            <SummaryRow label="Project" value={projectId || 'unknown'} />
            <SummaryRow
              label="Status"
              value={
                <span className={`inline-flex items-center gap-2 ${STATUS_ACCENT_CLASS[status]}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                  <span>{TASK_STATUS_LABEL[status]}</span>
                </span>
              }
            />
            <SummaryRow label="Run Result" value={msg || 'No result yet'} />
            <SummaryRow label="Plan State" value={planState || 'unknown'} />
            <SummaryRow
              label="PR Link"
              value={
                prUrl ? (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 underline decoration-sky-800 underline-offset-4 hover:text-sky-200"
                  >
                    {prUrl}
                  </a>
                ) : (
                  'Not created yet'
                )
              }
            />
            <SummaryRow label="Branch" value={branchName || 'n/a'} />
          </div>
        </TabsContent>

        <TabsContent value="logs" className="min-h-0 flex-1 overflow-hidden px-6 py-5">
          <div className="mb-3 flex gap-2">
            {(['all', 'info', 'warning', 'error', 'debug'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setActiveLevel(level)}
                className={`rounded border px-2 py-1 text-xs ${
                  activeLevel === level
                    ? 'border-orange-600 bg-orange-950/40 text-orange-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="h-[calc(100%-40px)] overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
            {filteredLogs.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className={`mb-1 ${
                  entry.level === 'error'
                    ? 'text-red-300'
                    : entry.level === 'warning'
                      ? 'text-amber-300'
                      : 'text-zinc-300'
                }`}
              >
                <span className="text-zinc-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>{' '}
                <span className="uppercase text-zinc-500">{entry.level}</span>{' '}
                <span>{entry.icon}</span> {entry.message}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="plan" className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-zinc-500">
            Editable Plan
          </label>
          <textarea
            value={editablePlan}
            onChange={(event) => setEditablePlan(event.target.value)}
            disabled={!canEditPlan}
            className="h-72 w-full rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-200 outline-none focus:border-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <TooltipProvider>
            <div className="mt-3 flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!canEditPlan || planActionPending}
                    onClick={onApprove}
                    className={`rounded border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_ACCENT_CLASS}`}
                  >
                    {approvePending ? 'Approving...' : 'Approve'}
                  </button>
                </TooltipTrigger>
                {!canEditPlan && (
                  <TooltipContent>
                    {planActionsDisabledByStatus
                      ? 'Plan actions are disabled once a task is failed or canceled.'
                      : actionGuard.reason}
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!canEditPlan || planActionPending}
                    onClick={onReject}
                    className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rejectPending ? 'Rejecting...' : 'Reject'}
                  </button>
                </TooltipTrigger>
                {!canEditPlan && (
                  <TooltipContent>
                    {planActionsDisabledByStatus
                      ? 'Plan actions are disabled once a task is failed or canceled.'
                      : actionGuard.reason}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </TooltipProvider>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-zinc-900 py-2">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className="break-all text-zinc-200">{value}</span>
    </div>
  )
}
