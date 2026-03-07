import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AppConfig } from '@parallax/common'
import { planActionsState, resolveProjectProvider } from '@/lib/task-helpers'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/task-constants'

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
  prNumber?: number
  lastReviewEventAt?: string
  reviewState?: string
  planState?: string
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
  prNumber,
  lastReviewEventAt,
  reviewState,
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
    if (!onApprovePlan || !actionGuard.canEdit) {
      return
    }
    setApprovePending(true)
    try {
      await onApprovePlan(taskId, 'operator', editablePlan)
    } finally {
      setApprovePending(false)
    }
  }

  const onReject = async () => {
    if (!onRejectPlan || !actionGuard.canEdit) {
      return
    }
    setRejectPending(true)
    try {
      await onRejectPlan(taskId)
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
      await onRetry(taskId)
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
      await onCancel(taskId)
    } finally {
      setCancelPending(false)
    }
  }

  const planActionPending = approvePending || rejectPending
  const canCancel =
    (status === 'queued' || status === 'running') && Boolean(onCancel) && !cancelPending
  const canRetry =
    (status === 'failed' || status === 'canceled') && Boolean(onRetry) && !retryPending
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
            <SummaryRow label="Status" value={TASK_STATUS_LABEL[status]} />
            <SummaryRow label="Run Result" value={msg || 'No result yet'} />
            <SummaryRow label="Plan State" value={planState || 'unknown'} />
            <SummaryRow label="Review State" value={reviewState || 'NONE'} />
            <SummaryRow label="PR Link" value={prUrl || 'Not created yet'} />
            <SummaryRow label="PR Number" value={prNumber ? String(prNumber) : 'n/a'} />
            <SummaryRow
              label="Last Review Event"
              value={lastReviewEventAt ? new Date(lastReviewEventAt).toLocaleString() : 'n/a'}
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
                    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
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
            disabled={!actionGuard.canEdit}
            className="h-72 w-full rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-200 outline-none focus:border-emerald-600"
          />
          <TooltipProvider>
            <div className="mt-3 flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!actionGuard.canEdit || planActionPending}
                    onClick={onApprove}
                    className="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {approvePending ? 'Approving...' : 'Approve'}
                  </button>
                </TooltipTrigger>
                {!actionGuard.canEdit && <TooltipContent>{actionGuard.reason}</TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!actionGuard.canEdit || planActionPending}
                    onClick={onReject}
                    className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rejectPending ? 'Rejecting...' : 'Reject'}
                  </button>
                </TooltipTrigger>
                {!actionGuard.canEdit && <TooltipContent>{actionGuard.reason}</TooltipContent>}
              </Tooltip>
            </div>
          </TooltipProvider>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-zinc-900 py-2">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className="break-all text-zinc-200">{value}</span>
    </div>
  )
}
