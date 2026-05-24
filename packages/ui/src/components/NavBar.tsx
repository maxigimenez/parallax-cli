import { cn } from '@/lib/utils'
import { Github, List, FolderOpen, Plug } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ActiveView } from './ListPanel'

interface NavBarProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  isConnected: boolean
}

const NAV_ITEMS: { id: ActiveView; icon: React.ReactNode; label: string }[] = [
  { id: 'tasks', icon: <List className="h-4 w-4" />, label: 'Tasks' },
  { id: 'projects', icon: <FolderOpen className="h-4 w-4" />, label: 'Projects' },
  { id: 'integrations', icon: <Plug className="h-4 w-4" />, label: 'Integrations' },
]

export function NavBar({ activeView, onViewChange, isConnected }: NavBarProps) {
  return (
    <nav className="flex h-full w-[52px] shrink-0 flex-col items-center border-r border-zinc-800 bg-[#080808] py-3">
      {/* Connection indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mb-4 flex h-7 w-7 items-center justify-center rounded">
            <span
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                isConnected ? 'bg-green-500' : 'bg-zinc-600'
              )}
              aria-label={isConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isConnected ? 'Connected to orchestrator' : 'Disconnected'}
        </TooltipContent>
      </Tooltip>

      {/* Nav items */}
      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onViewChange(item.id)}
                aria-label={item.label}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded transition-colors',
                  activeView === item.id
                    ? 'bg-orange-950/60 text-orange-400'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                )}
              >
                {item.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* GitHub link */}
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://github.com/maxigimenez/parallax"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub repository"
            className="flex h-9 w-9 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Github className="h-4 w-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="right">GitHub repository</TooltipContent>
      </Tooltip>
    </nav>
  )
}
