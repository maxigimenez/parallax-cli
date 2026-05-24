import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TaskInfo } from '@/hooks/useParallax'
import type { AppConfig } from '@parallax/common'
import {
  FolderOpen,
  Github,
  Hash,
  Layers,
  List,
  Plug,
  Plus,
} from 'lucide-react'
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/task-constants'

export type ActiveView = 'tasks' | 'projects' | 'integrations'

interface ListPanelProps {
  selectedId: string | null
  onSelectItem: (id: string) => void
  activeView: ActiveView
  onAddProject: () => void
  tasks: TaskInfo[]
  config: AppConfig | null
}

const STATUS_ORDER: TaskStatus[] = [
  TASK_STATUS.QUEUED,
  TASK_STATUS.RUNNING,
  TASK_STATUS.CANCELED,
  TASK_STATUS.FAILED,
  TASK_STATUS.DONE,
]

const STATUS_DOT_COLOR: Record<TaskStatus, string> = {
  [TASK_STATUS.QUEUED]: '#71717a',
  [TASK_STATUS.RUNNING]: '#3b82f6',
  [TASK_STATUS.CANCELED]: '#eab308',
  [TASK_STATUS.FAILED]: '#ef4444',
  [TASK_STATUS.DONE]: '#22c55e',
}

const INTEGRATION_ITEMS = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Issues & pull requests',
    icon: <Github className="h-4 w-4" />,
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Issue tracker',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Notifications',
    icon: <Hash className="h-4 w-4" />,
  },
] as const

const VIEW_META: Record<ActiveView, { label: string; icon: React.ReactNode }> = {
  tasks: { label: 'Tasks', icon: <List className="h-3.5 w-3.5" /> },
  projects: { label: 'Projects', icon: <FolderOpen className="h-3.5 w-3.5" /> },
  integrations: { label: 'Integrations', icon: <Plug className="h-3.5 w-3.5" /> },
}

export function ListPanel({
  selectedId,
  onSelectItem,
  activeView,
  onAddProject,
  tasks,
  config,
}: ListPanelProps) {
  const counts = useMemo(() => {
    const initial: Record<TaskStatus, number> = {
      [TASK_STATUS.QUEUED]: 0,
      [TASK_STATUS.RUNNING]: 0,
      [TASK_STATUS.CANCELED]: 0,
      [TASK_STATUS.FAILED]: 0,
      [TASK_STATUS.DONE]: 0,
    }
    for (const task of tasks) {
      initial[task.status] += 1
    }
    return initial
  }, [tasks])

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-zinc-800 bg-[#080808]">
      {/* Panel header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 text-zinc-400">
          {VIEW_META[activeView].icon}
          <p className="text-[10px] font-bold tracking-widest uppercase">
            {VIEW_META[activeView].label}
          </p>
        </div>
      </div>

      {/* Panel content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeView === 'tasks' && (
          <>
            <div className="space-y-1.5 border-b border-zinc-800 p-3">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{TASK_STATUS_LABEL[status]}</span>
                  <span className="rounded bg-zinc-900 px-2 py-0.5 text-zinc-100 tabular-nums">
                    {counts[status]}
                  </span>
                </div>
              ))}
            </div>
            <div>
              {tasks.map((task) => {
                const selected = selectedId === task.id
                return (
                  <button
                    key={task.id}
                    onClick={() => onSelectItem(task.id)}
                    className={cn(
                      'w-full border-b border-zinc-900 px-3 py-3 text-left transition-colors',
                      selected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: STATUS_DOT_COLOR[task.status] }}
                        aria-hidden
                      />
                      <p className="truncate text-xs font-medium text-zinc-100">{task.id}</p>
                    </div>
                    <p className="mb-1.5 truncate text-[11px] text-zinc-500 pl-3.5">{task.title}</p>
                    <div className="flex items-center justify-between pl-3.5 text-[11px]">
                      <span className="text-zinc-600">{task.projectId}</span>
                      <span className="text-zinc-500">{TASK_STATUS_LABEL[task.status]}</span>
                    </div>
                  </button>
                )
              })}
              {tasks.length === 0 && (
                <p className="p-3 text-xs text-zinc-600">No tasks yet.</p>
              )}
            </div>
          </>
        )}

        {activeView === 'projects' && (
          <>
            <div className="border-b border-zinc-800 p-3">
              <button
                onClick={onAddProject}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 hover:border-orange-700 hover:text-orange-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add project
              </button>
            </div>
            <div>
              {(config?.projects ?? []).map((project) => {
                const selected = selectedId === `project-${project.id}`
                return (
                  <button
                    key={project.id}
                    onClick={() => onSelectItem(`project-${project.id}`)}
                    className={cn(
                      'w-full border-b border-zinc-900 px-3 py-3 text-left transition-colors',
                      selected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                    )}
                  >
                    <p className="truncate text-xs font-medium text-zinc-100">{project.id}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>{project.pullFrom.provider}</span>
                      <span>·</span>
                      <span>{project.agent.provider}</span>
                    </div>
                  </button>
                )
              })}
              {(config?.projects ?? []).length === 0 && (
                <p className="p-3 text-xs text-zinc-600">No projects. Add one above.</p>
              )}
            </div>
          </>
        )}

        {activeView === 'integrations' && (
          <div>
            {INTEGRATION_ITEMS.map((item) => {
              const selected = selectedId === `integration-${item.id}`
              const isSlackConnected = item.id === 'slack' && !!config?.slack
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectItem(`integration-${item.id}`)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-zinc-900 px-3 py-3 text-left transition-colors',
                    selected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 shrink-0 transition-colors',
                      selected ? 'text-orange-400' : 'text-zinc-500'
                    )}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-100">{item.label}</p>
                      {isSlackConnected && (
                        <span className="text-[10px] text-green-500">Connected</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{item.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

      </div>
    </aside>
  )
}
