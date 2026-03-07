import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TaskInfo } from '@/hooks/useParallax'
import type { AppConfig, ProjectConfig } from '@parallax/common'
import { Github, Settings } from 'lucide-react'
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/task-constants'

interface TaskSidebarProps {
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  activeView: 'tasks' | 'settings'
  onViewChange: (view: 'tasks' | 'settings') => void
  tasks: TaskInfo[]
  config: AppConfig | null
  isConnected: boolean
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

export function TaskSidebar({
  selectedTaskId,
  onSelectTask,
  activeView,
  onViewChange,
  tasks,
  config,
  isConnected,
}: TaskSidebarProps) {
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
    <aside className="h-full w-[340px] shrink-0 border-l border-zinc-800 bg-[#080808]">
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-semibold text-zinc-100">
              parallax<span className="animate-terminal-cursor text-emerald-500">_</span>
            </p>
            <p className="text-xs text-zinc-500">{isConnected ? 'Connected' : 'Disconnected'}</p>
          </div>
          <a
            href="https://github.com/maxigimenez/parallax"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:text-zinc-100"
            title="Open source repository"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onViewChange('tasks')}
            className={cn(
              'rounded border px-3 py-2 text-xs font-medium',
              activeView === 'tasks'
                ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            )}
          >
            Tasks
          </button>
          <button
            onClick={() => onViewChange('settings')}
            className={cn(
              'rounded border px-3 py-2 text-xs font-medium',
              activeView === 'settings'
                ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            )}
          >
            Config
          </button>
        </div>
      </div>

      {activeView === 'tasks' ? (
        <>
          <div className="space-y-2 border-b border-zinc-800 p-4">
            {STATUS_ORDER.map((status) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">{TASK_STATUS_LABEL[status]}</span>
                <span className="rounded bg-zinc-900 px-2 py-0.5 text-zinc-100">{counts[status]}</span>
              </div>
            ))}
          </div>
          <div className="h-[calc(100%-232px)] overflow-y-auto">
            {tasks.map((task) => {
              const selected = selectedTaskId === task.id
              return (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className={cn(
                    'w-full border-b border-zinc-900 px-4 py-3 text-left transition-colors',
                    selected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: STATUS_DOT_COLOR[task.status] }}
                      aria-hidden
                    />
                    <p className="truncate text-sm font-medium text-zinc-100">{task.id}</p>
                  </div>
                  <p className="mb-2 truncate text-xs text-zinc-500">{task.title || task.msg}</p>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">{task.projectId || 'unknown project'}</span>
                    <span className="text-zinc-500">{TASK_STATUS_LABEL[task.status]}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="h-[calc(100%-124px)] overflow-y-auto p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
            <Settings className="h-3.5 w-3.5" />
            <span>Projects</span>
          </div>
          <div className="space-y-2">
            {config?.projects?.map((project: ProjectConfig, index: number) => (
              <button
                key={project.id}
                onClick={() => onSelectTask(`project-${index}`)}
                className={cn(
                  'w-full rounded border px-3 py-2 text-left text-xs',
                  selectedTaskId === `project-${index}`
                    ? 'border-emerald-600 bg-zinc-900 text-zinc-100'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-zinc-100'
                )}
              >
                {project.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
