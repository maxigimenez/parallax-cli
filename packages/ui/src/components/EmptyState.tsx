import { WifiOff } from 'lucide-react'

const API_BASE =
  window.__PARALLAX_RUNTIME_CONFIG__?.apiBase ||
  import.meta.env.VITE_PARALLAX_API_BASE ||
  'http://localhost:3000'

interface EmptyStateProps {
  view: 'tasks' | 'settings'
  isConnected: boolean
  hasTasks: boolean
  waitingTasks: number
}

export function EmptyState({ view, isConnected, hasTasks, waitingTasks }: EmptyStateProps) {
  if (!isConnected) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#060606]">
        <div className="rounded border border-red-900 bg-red-950/20 px-6 py-5 text-center">
          <WifiOff className="mx-auto mb-3 h-7 w-7 text-red-400" />
          <h2 className="mb-2 text-sm font-semibold text-red-300">Orchestrator Offline</h2>
          <p className="text-xs text-zinc-400">
            Could not connect to the Parallax backend on <code>{API_BASE}</code>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[#060606] p-8">
      <div className="w-full max-w-2xl rounded border border-zinc-800 bg-[#090909] p-6">
        <p className="mb-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Parallax Status</p>
        <div className="font-mono text-3xl text-zinc-100">
          parallax
          <span className="animate-terminal-cursor text-emerald-500">_</span>
        </div>
        <div className="mt-4 space-y-2 text-sm text-zinc-400">
          <p>Waiting tasks: {waitingTasks}</p>
          <p>
            {view === 'settings'
              ? 'Select a project from the config tab.'
              : hasTasks
                ? 'Select a task from the sidebar to inspect details.'
                : 'No tasks loaded yet. Parallax is polling for work.'}
          </p>
        </div>
      </div>
    </div>
  )
}
