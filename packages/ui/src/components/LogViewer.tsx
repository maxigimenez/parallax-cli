import { useEffect, useMemo, useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type AppConfig, type TaskLogEntry, type TaskPlanState } from '@parallax/common'
import {
  buildTaskSummaryStatusModel,
  formatPlanStateLabel,
  planActionsState,
  resolveTaskDisplayMetadata,
} from '@/lib/task-helpers'
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/task-constants'
import { normalizeLogMessage } from '@/lib/log-presentation'
import {
  ArrowLeft,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileClock,
  FileText,
  GitBranch,
  GitPullRequest,
  Info,
  LoaderCircle,
  Logs,
  OctagonX,
  Package2,
  RefreshCw,
  Search,
  Sparkles,
  SquareTerminal,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'

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
  logs: TaskLogEntry[]
  status: TaskStatus
  branchName?: string
  prUrl?: string
  planState?: TaskPlanState
  planMarkdown?: string
  planPrompt?: string
  planResult?: string
  lastAgent?: string
  config: AppConfig | null
  onRetry?: (taskId: string) => Promise<void>
  onCancel?: (taskId: string) => Promise<void>
  onApprovePlan?: (taskId: string, approver?: string, planMarkdown?: string) => Promise<void>
  onRejectPlan?: (taskId: string) => Promise<void>
  viewMode: 'dashboard' | 'logs'
  onOpenLogs?: () => void
  onOpenDashboard?: () => void
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
  lastAgent,
  config,
  onRetry,
  onCancel,
  onApprovePlan,
  onRejectPlan,
  viewMode,
  onOpenLogs,
  onOpenDashboard,
}: LogViewerProps) {
  const [activeLevel, setActiveLevel] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>(
    'all'
  )
  const [editablePlan, setEditablePlan] = useState((planMarkdown || planResult || planPrompt || '').trim())
  const [approvePending, setApprovePending] = useState(false)
  const [rejectPending, setRejectPending] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const taskMetadata = resolveTaskDisplayMetadata(config, projectId, lastAgent)
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
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return logs.filter((entry) => {
      if (activeLevel !== 'all' && entry.level !== activeLevel) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const searchableText = [
        entry.message,
        entry.title,
        entry.kind,
        entry.source,
        entry.level,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedSearch)
    })
  }, [activeLevel, logs, searchTerm])
  const summaryStatus = useMemo(
    () => buildTaskSummaryStatusModel(status, planState, Boolean(prUrl)),
    [status, planState, prUrl]
  )
  const summaryToneClass = SUMMARY_TONE_CLASS[summaryStatus.tone]
  const planStateLabel = planState ? formatPlanStateLabel(planState) : null
  const showPlanStateMeta = Boolean(planState && planState !== 'NOT_REQUIRED' && planState !== 'PLAN_APPROVED')
  const reviewCommand = `parallax pr-review ${taskId}`
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
  const hasPlanContent = Boolean(editablePlan)
  const readOnlyPlan = editablePlan || getPlanFallbackCopy(planState)
  const planUnavailable = !hasPlanContent && (!planState || planState === 'NOT_REQUIRED')
  const SummaryStatusIcon = STATUS_ICON[status]

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

  return (
    <div className="flex h-full flex-1 flex-col bg-[#060606]">
      <div className="border-b border-zinc-800 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-zinc-100">{taskId}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {title || description || 'No task summary available.'}
            </p>
            {viewMode === 'logs' && onOpenDashboard ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to dashboard
              </button>
            ) : null}
          </div>
          <TooltipProvider>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onOpenLogs}
                disabled={viewMode === 'logs'}
                className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-100 ${
                  viewMode === 'logs'
                    ? ACTION_ACCENT_CLASS
                    : 'border-orange-700/70 bg-orange-950/20 text-orange-200 hover:bg-orange-950/35'
                }`}
              >
                <Logs className="h-3.5 w-3.5" />
                Logs
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={!canRetry}
                    onClick={onRetryClick}
                    className="inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
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
                    className="inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <OctagonX className="h-3.5 w-3.5" />
                    {cancelPending ? 'Cancelling...' : 'Cancel'}
                  </button>
                </TooltipTrigger>
                {!canCancel && <TooltipContent>{cancelReason}</TooltipContent>}
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      {viewMode === 'logs' ? (
        <section className="min-h-0 flex-1 overflow-hidden px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
              <Search className="h-3.5 w-3.5 text-zinc-500" />
              <span className="whitespace-nowrap uppercase tracking-[0.14em] text-zinc-500">
                Text search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search transcript"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
              </span>
              {([
                { level: 'all', icon: SlidersHorizontal, label: 'All' },
                { level: 'info', icon: Info, label: 'Info' },
                { level: 'warning', icon: AlertTriangle, label: 'Warning' },
                { level: 'error', icon: XCircle, label: 'Error' },
                { level: 'debug', icon: Bot, label: 'Debug' },
              ] as const).map(({ level, icon: LevelIcon, label }) => (
                <button
                  key={level}
                  onClick={() => setActiveLevel(level)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs ${
                    activeLevel === level
                      ? 'border-orange-600 bg-orange-950/40 text-orange-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  <LevelIcon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[calc(100%-56px)] overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
            {filteredLogs.length === 0 ? (
              <div className="rounded border border-zinc-800 bg-zinc-950/70 px-4 py-6 font-sans text-sm text-zinc-500">
                No transcript lines match the current search and filters.
              </div>
            ) : (
              filteredLogs.map((entry, index) => (
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
                  <span>{entry.icon}</span>{' '}
                  {normalizeLogMessage(entry.message, entry.title, entry.kind)}
                </div>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <section className={`rounded-xl border px-5 py-5 ${summaryToneClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Workflow status</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                    <SummaryStatusIcon className={`h-5 w-5 ${STATUS_ACCENT_CLASS[status]}`} />
                    <h3 className="text-2xl font-semibold text-zinc-100">{summaryStatus.title}</h3>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_ACCENT_CLASS[status]} border-current/20 bg-black/20`}
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                  {TASK_STATUS_LABEL[status]}
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                {summaryStatus.description}
              </p>
              {summaryStatus.alert ? (
                <div className="mt-4 rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-3">
                  <p className="text-sm font-medium text-amber-200">{summaryStatus.alert.title}</p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/85">
                    {summaryStatus.alert.description}
                  </p>
                </div>
              ) : null}
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.45fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-5 py-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-zinc-800 bg-black/20 p-2 text-zinc-300">
                      <Info className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Task details</p>
                      <h3 className="mt-2 text-lg font-semibold text-zinc-100">Task details</h3>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3">
                    <SummaryMetaChip label="Project" value={projectId || 'unknown'} icon={Package2} />
                    <SummaryMetaChip
                      label="Source Provider"
                      value={taskMetadata.provider}
                      icon={SquareTerminal}
                    />
                    <SummaryMetaChip label="Used AI" value={taskMetadata.usedAi} icon={Bot} />
                    {taskMetadata.model ? (
                      <SummaryMetaChip label="Model" value={taskMetadata.model} icon={Sparkles} />
                    ) : null}
                  </div>
                </section>

                <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-5 py-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-zinc-800 bg-black/20 p-2 text-zinc-300">
                      <GitPullRequest className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Outcome</p>
                      <h3 className="mt-2 text-lg font-semibold text-zinc-100">Delivery result</h3>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">
                    Review the generated branch and pull request details for this task.
                  </p>

                  <div className="mt-5 grid gap-4">
                    <SummaryInfoBlock
                      label="Pull Request"
                      icon={GitPullRequest}
                      value={
                        prUrl ? (
                          <a
                            href={prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-sky-300 underline decoration-sky-800 underline-offset-4 hover:text-sky-200"
                          >
                            {prUrl}
                          </a>
                        ) : (
                          'Not created yet'
                        )
                      }
                    />
                    <SummaryInfoBlock label="Branch" icon={GitBranch} value={branchName || 'Not available'} />
                  </div>

                  {prUrl ? (
                    <div className="mt-5 rounded-lg border border-orange-800/70 bg-orange-950/30 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-orange-200">
                        <ClipboardList className="h-4 w-4" />
                        <p>PR review shortcut</p>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-orange-100/85">
                        If the pull request gets comments, run the review flow directly from your terminal.
                      </p>
                      <code className="mt-3 block rounded-md border border-orange-800/60 bg-black/30 px-3 py-2 text-sm text-orange-100">
                        {reviewCommand}
                      </code>
                    </div>
                  ) : null}
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg border border-zinc-800 bg-black/20 p-2 text-zinc-300">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Plan</p>
                        <h3 className="mt-2 text-lg font-semibold text-zinc-100">
                          {canEditPlan ? 'Editable execution plan' : 'Execution plan'}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          Review the proposed implementation here before execution continues.
                        </p>
                      </div>
                    </div>
                    {planStateLabel ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black/20 px-3 py-1 text-xs text-zinc-300">
                        <PlanStateIcon planState={planState} className="h-3.5 w-3.5" />
                        {planStateLabel}
                      </span>
                    ) : null}
                  </div>

                  {planUnavailable ? (
                    <div className="mt-4 rounded-lg border border-sky-900/60 bg-sky-950/20 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-sky-200">
                        <Info className="h-4 w-4" />
                        <p>Plan is not available for this task.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!canEditPlan && (showPlanStateMeta || planActionsDisabledByStatus) ? (
                        <div className="mt-4 rounded-lg border border-zinc-800 bg-black/20 px-4 py-3">
                          <p className="text-sm font-medium text-zinc-200">
                            {planActionsDisabledByStatus
                              ? 'Plan actions are disabled once a task is failed or canceled.'
                              : actionGuard.reason}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-4">
                        {canEditPlan ? (
                          <textarea
                            value={editablePlan}
                            onChange={(event) => setEditablePlan(event.target.value)}
                            disabled={!canEditPlan}
                            className="h-80 w-full rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-200 outline-none focus:border-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        ) : (
                          <div className="min-h-40 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-300">
                            {readOnlyPlan}
                          </div>
                        )}
                      </div>

                      <TooltipProvider>
                        <div className="mt-3 flex gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                disabled={!canEditPlan || planActionPending}
                                onClick={onApprove}
                                className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_ACCENT_CLASS}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
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
                                className="inline-flex items-center gap-2 rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <XCircle className="h-3.5 w-3.5" />
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
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

const SUMMARY_TONE_CLASS = {
  neutral: 'border-zinc-800 bg-zinc-950/70',
  info: 'border-sky-900/60 bg-sky-950/20',
  success: 'border-emerald-900/60 bg-emerald-950/20',
  warning: 'border-amber-900/60 bg-amber-950/20',
  danger: 'border-red-900/60 bg-red-950/20',
} as const

const STATUS_ICON: Record<TaskStatus, typeof Clock3> = {
  [TASK_STATUS.QUEUED]: Clock3,
  [TASK_STATUS.RUNNING]: LoaderCircle,
  [TASK_STATUS.CANCELED]: OctagonX,
  [TASK_STATUS.FAILED]: XCircle,
  [TASK_STATUS.DONE]: CheckCircle2,
}

function PlanStateIcon({
  planState,
  className,
}: {
  planState?: TaskPlanState
  className?: string
}) {
  if (planState === 'PLAN_GENERATING') {
    return <FileClock className={className} />
  }
  if (planState === 'PLAN_FAILED' || planState === 'PLAN_REJECTED') {
    return <XCircle className={className} />
  }
  if (planState === 'PLAN_READY' || planState === 'PLAN_REQUIRES_CLARIFICATION') {
    return <ClipboardList className={className} />
  }
  return <FileText className={className} />
}

function getPlanFallbackCopy(planState?: TaskPlanState) {
  if (!planState) {
    return 'No plan content available.'
  }

  switch (planState) {
    case 'PLAN_GENERATING':
      return 'Parallax is preparing the execution plan for this task.'
    case 'PLAN_FAILED':
      return 'Plan generation failed before a reviewable plan could be captured.'
    case 'PLAN_REJECTED':
      return 'The most recent plan was rejected.'
    default:
      return 'No plan content available.'
  }
}

function SummaryInfoBlock({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | JSX.Element
  icon?: typeof Info
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/20 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <p>{label}</p>
      </div>
      <div className="mt-2 break-all text-sm text-zinc-200">{value}</div>
    </div>
  )
}

function SummaryMetaChip({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Info
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/20 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <p>{label}</p>
      </div>
      <p className="mt-2 text-sm text-zinc-200">{value}</p>
    </div>
  )
}
