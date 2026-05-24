import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2, Save, X, FolderOpen } from 'lucide-react'
import type { ProjectConfig } from '@parallax/common'

interface ProjectEditorProps {
  project: ProjectConfig
  onUpdate: (id: string, patch: Partial<ProjectConfig>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function ProjectEditor({ project, onUpdate, onDelete }: ProjectEditorProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workspaceDir, setWorkspaceDir] = useState(project.workspaceDir)
  const [agentProvider, setAgentProvider] = useState(project.agent.provider)
  const [agentModel, setAgentModel] = useState(project.agent.model ?? '')
  const [labelFilter, setLabelFilter] = useState(
    project.pullFrom.filters.labels?.[0] ?? ''
  )

  const resetForm = () => {
    setWorkspaceDir(project.workspaceDir)
    setAgentProvider(project.agent.provider)
    setAgentModel(project.agent.model ?? '')
    setLabelFilter(project.pullFrom.filters.labels?.[0] ?? '')
    setError(null)
  }

  useEffect(() => {
    setWorkspaceDir(project.workspaceDir)
    setAgentProvider(project.agent.provider)
    setAgentModel(project.agent.model ?? '')
    setLabelFilter(project.pullFrom.filters.labels?.[0] ?? '')
    setError(null)
    setEditing(false)
    setConfirmDelete(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const patch: Partial<ProjectConfig> = {
        workspaceDir: workspaceDir.trim() || project.workspaceDir,
        pullFrom: {
          ...project.pullFrom,
          filters: {
            ...project.pullFrom.filters,
            labels: labelFilter.trim() ? [labelFilter.trim()] : undefined,
          },
        },
        agent: {
          provider: agentProvider,
          model: agentModel.trim() || undefined,
        },
      }
      await onUpdate(project.id, patch)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(project.id)
      navigate('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const provider = project.pullFrom.provider
  const filters = project.pullFrom.filters

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
            Project
          </span>
          <span className="text-[10px] text-zinc-500">— {project.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); resetForm() }}
                className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded border border-orange-700 bg-orange-950/60 px-2 py-1 text-[11px] text-orange-300 hover:text-orange-100 disabled:opacity-50"
              >
                <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <>
              {confirmDelete ? (
                <>
                  <span className="text-[11px] text-red-400">Delete this project?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    No
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded border border-red-700 bg-red-950/60 px-2 py-1 text-[11px] text-red-300 hover:text-red-100 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-900 bg-red-950/20 px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
        {/* Identity */}
        <section>
          <p className="mb-3 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Identity</p>
          <div className="space-y-2">
            <Row label="ID" value={project.id} />
            {editing ? (
              <EditRow label="Workspace" value={workspaceDir} onChange={setWorkspaceDir} />
            ) : (
              <Row label="Workspace" value={project.workspaceDir} />
            )}
          </div>
        </section>

        {/* Issue source */}
        <section>
          <p className="mb-3 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Issue Source</p>
          <div className="space-y-2">
            <Row label="Provider" value={provider} />
            {provider === 'github' && (
              <>
                <Row label="Owner" value={filters.owner ?? '—'} />
                <Row label="Repo" value={filters.repo ?? '—'} />
              </>
            )}
            {provider === 'linear' && (
              <Row label="Team" value={filters.team ?? '—'} />
            )}
            {editing ? (
              <EditRow label="Label filter" value={labelFilter} onChange={setLabelFilter} placeholder="e.g. ai-ready" />
            ) : (
              <Row label="Labels" value={filters.labels?.join(', ') || '—'} />
            )}
          </div>
        </section>

        {/* Agent */}
        <section>
          <p className="mb-3 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Agent</p>
          <div className="space-y-2">
            {editing ? (
              <SelectRow
                label="Provider"
                value={agentProvider}
                onChange={(v) => setAgentProvider(v as ProjectConfig['agent']['provider'])}
                options={[
                  { value: 'claude-code', label: 'Claude Code' },
                  { value: 'codex', label: 'OpenAI Codex' },
                  { value: 'gemini', label: 'Google Gemini' },
                ]}
              />
            ) : (
              <Row label="Provider" value={project.agent.provider} />
            )}
            {editing ? (
              <EditRow label="Model" value={agentModel} onChange={setAgentModel} placeholder="provider default" />
            ) : (
              <Row label="Model" value={project.agent.model || '—'} />
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-28 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <span className="text-[12px] text-zinc-200 break-all">{value}</span>
    </div>
  )
}

function EditRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-28 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
      />
    </div>
  )
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-28 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100 focus:border-orange-600 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

