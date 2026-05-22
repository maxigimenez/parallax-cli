import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import type { ProjectConfig } from '@parallax/common'

interface AddProjectWizardProps {
  existingIds: string[]
  onAdd: (project: ProjectConfig) => Promise<void>
  onClose: () => void
}

type Step = 'identity' | 'source' | 'agent' | 'confirm'
const STEPS: Step[] = ['identity', 'source', 'agent', 'confirm']

const STEP_LABELS: Record<Step, string> = {
  identity: 'Project',
  source: 'Issue Source',
  agent: 'Agent',
  confirm: 'Confirm',
}

export function AddProjectWizard({ existingIds, onAdd, onClose }: AddProjectWizardProps) {
  const [step, setStep] = useState<Step>('identity')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Identity
  const [projectId, setProjectId] = useState('')
  const [workspaceDir, setWorkspaceDir] = useState('')

  // Source
  const [provider, setProvider] = useState<'github' | 'linear'>('github')
  const [ghOwner, setGhOwner] = useState('')
  const [ghRepo, setGhRepo] = useState('')
  const [linearTeam, setLinearTeam] = useState('')
  const [labelFilter, setLabelFilter] = useState('')

  // Agent
  const [agentProvider, setAgentProvider] = useState<ProjectConfig['agent']['provider']>('claude-code')
  const [agentModel, setAgentModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const stepIndex = STEPS.indexOf(step)

  const validateStep = (): string | null => {
    if (step === 'identity') {
      if (!projectId.trim()) return 'Project ID is required.'
      if (/\s/.test(projectId)) return 'Project ID must not contain spaces.'
      if (existingIds.includes(projectId.trim())) return `Project "${projectId.trim()}" already exists.`
      if (!workspaceDir.trim()) return 'Workspace directory is required.'
    }
    if (step === 'source') {
      if (provider === 'github') {
        if (!ghOwner.trim()) return 'GitHub owner is required.'
        if (!ghRepo.trim()) return 'GitHub repository is required.'
      } else {
        if (!linearTeam.trim()) return 'Linear team ID is required.'
      }
    }
    return null
  }

  const handleNext = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError(null)
    const nextIndex = stepIndex + 1
    if (nextIndex < STEPS.length) setStep(STEPS[nextIndex])
  }

  const handleBack = () => {
    setError(null)
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) setStep(STEPS[prevIndex])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const project: ProjectConfig = {
        id: projectId.trim(),
        workspaceDir: workspaceDir.trim(),
        pullFrom: {
          provider,
          filters:
            provider === 'github'
              ? {
                  owner: ghOwner.trim(),
                  repo: ghRepo.trim(),
                  state: 'open',
                  labels: labelFilter.trim() ? [labelFilter.trim()] : undefined,
                }
              : {
                  team: linearTeam.trim(),
                  labels: labelFilter.trim() ? [labelFilter.trim()] : undefined,
                },
        },
        agent: {
          provider: agentProvider,
          model: agentModel.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
        },
      }
      await onAdd(project)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded border border-zinc-800 bg-[#0a0a0a] font-mono shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
            Add Project
          </span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex border-b border-zinc-800">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 py-2 text-center text-[10px] ${
                i < stepIndex
                  ? 'text-orange-500'
                  : i === stepIndex
                  ? 'text-zinc-100'
                  : 'text-zinc-600'
              }`}
            >
              {i < stepIndex ? <Check className="mx-auto h-3 w-3" /> : STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 min-h-[240px]">
          {error && (
            <div className="rounded border border-red-900 bg-red-950/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {step === 'identity' && (
            <>
              <Field label="Project ID" required>
                <input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="my-app"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                />
              </Field>
              <Field label="Absolute path to git repository" required>
                <input
                  value={workspaceDir}
                  onChange={(e) => setWorkspaceDir(e.target.value)}
                  placeholder="/path/to/repo"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                />
              </Field>
            </>
          )}

          {step === 'source' && (
            <>
              <Field label="Issue provider">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'github' | 'linear')}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:border-orange-600 focus:outline-none"
                >
                  <option value="github">GitHub Issues</option>
                  <option value="linear">Linear</option>
                </select>
              </Field>
              {provider === 'github' ? (
                <>
                  <Field label="Owner / org" required>
                    <input
                      value={ghOwner}
                      onChange={(e) => setGhOwner(e.target.value)}
                      placeholder="acme"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                    />
                  </Field>
                  <Field label="Repository name" required>
                    <input
                      value={ghRepo}
                      onChange={(e) => setGhRepo(e.target.value)}
                      placeholder="my-app"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                    />
                  </Field>
                </>
              ) : (
                <Field label="Team ID or key" required>
                  <input
                    value={linearTeam}
                    onChange={(e) => setLinearTeam(e.target.value)}
                    placeholder="ENG"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                  />
                </Field>
              )}
              <Field label="Label filter (optional)">
                <input
                  value={labelFilter}
                  onChange={(e) => setLabelFilter(e.target.value)}
                  placeholder="ai-ready"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                />
              </Field>
            </>
          )}

          {step === 'agent' && (
            <>
              <Field label="AI agent">
                <select
                  value={agentProvider}
                  onChange={(e) => setAgentProvider(e.target.value as ProjectConfig['agent']['provider'])}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:border-orange-600 focus:outline-none"
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">OpenAI Codex</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </Field>
              <Field label="Model override (optional)">
                <input
                  value={agentModel}
                  onChange={(e) => setAgentModel(e.target.value)}
                  placeholder="provider default"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
                />
              </Field>
              <Field label="System prompt (optional)">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none resize-y min-h-[100px]"
                />
              </Field>
            </>
          )}

          {step === 'confirm' && (
            <div className="space-y-2 text-xs">
              <SummaryRow label="ID" value={projectId.trim()} />
              <SummaryRow label="Workspace" value={workspaceDir.trim()} />
              <SummaryRow label="Provider" value={provider} />
              {provider === 'github' ? (
                <SummaryRow label="Repo" value={`${ghOwner.trim()}/${ghRepo.trim()}`} />
              ) : (
                <SummaryRow label="Team" value={linearTeam.trim()} />
              )}
              {labelFilter.trim() && <SummaryRow label="Label" value={labelFilter.trim()} />}
              <SummaryRow label="Agent" value={agentProvider + (agentModel.trim() ? ` (${agentModel.trim()})` : '')} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <button
            onClick={stepIndex === 0 ? onClose : handleBack}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
          >
            {stepIndex > 0 && <ChevronLeft className="h-3 w-3" />}
            {stepIndex === 0 ? 'Cancel' : 'Back'}
          </button>
          {step === 'confirm' ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded border border-orange-700 bg-orange-950/60 px-3 py-1.5 text-xs text-orange-300 hover:text-orange-100 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add project'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-zinc-500">
        {label}
        {required && <span className="ml-0.5 text-orange-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-zinc-500">{label}</span>
      <span className="text-zinc-200 break-all">{value || '—'}</span>
    </div>
  )
}
