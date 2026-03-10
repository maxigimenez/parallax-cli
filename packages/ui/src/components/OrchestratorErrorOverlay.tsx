type OrchestratorErrorOverlayProps = {
  errors: string[]
}

export function OrchestratorErrorOverlay({ errors }: OrchestratorErrorOverlayProps) {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-5">
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-red-500/40 bg-[#120909]/95 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-red-500/25 bg-red-500/10 px-4 py-3">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <div className="text-sm font-semibold text-red-100">Orchestrator Errors</div>
        </div>
        <div className="max-h-[min(32rem,70vh)] w-[min(48rem,calc(100vw-2.5rem))] overflow-auto px-4 py-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-red-100/90">
            {errors.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  )
}
