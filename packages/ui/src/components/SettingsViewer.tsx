import { useMemo } from 'react'
import { FileCode2 } from 'lucide-react'
import type { AppConfig } from '@parallax/common'

interface SettingsViewerProps {
  projectIndex: number
  config: AppConfig | null
}

export function SettingsViewer({ projectIndex, config }: SettingsViewerProps) {
  const project = config?.projects?.[projectIndex]

  const configText = useMemo(() => {
    if (!project) return '# No project selected'
    return JSON.stringify(project, null, 2)
      .replace(/{/g, '')
      .replace(/}/g, '')
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/,/g, '')
  }, [project])

  const lines = useMemo(() => configText.split('\n').filter((line) => line.trim()), [configText])

  const renderLine = (line: string) => {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const spaces = '\u00A0'.repeat(indent);

    if (trimmed.includes(': ')) {
      const [key, ...rest] = trimmed.split(': ');
      const value = rest.join(': ');
      return (
        <span>
          {spaces}
          <span className="text-orange-400">{key}</span>
          <span className="text-zinc-500">: </span>
          <span className="text-zinc-200">{value}</span>
        </span>
      )
    }

    return (
      <span className="text-zinc-200">
        {spaces}
        {trimmed}
      </span>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
            Project Config
          </span>
          <span className="text-[10px] text-zinc-500">— {project?.id || 'unknown'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 leading-relaxed">
        {lines.map((line, index) => (
          <div key={index} className="flex items-center group">
            <span className="w-8 shrink-0 select-none pr-3 text-right text-[10px] text-zinc-600">
              {index + 1}
            </span>
            <span className="flex-1 text-[12px]">{renderLine(line)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
