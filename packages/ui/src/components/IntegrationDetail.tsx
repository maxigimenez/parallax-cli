import { useState } from 'react'
import { Github, Hash, ExternalLink } from 'lucide-react'
import type { AppConfig, SlackConfig } from '@parallax/common'

type IntegrationName = 'github' | 'linear' | 'slack'

interface IntegrationDetailProps {
  name: IntegrationName
  config: AppConfig | null
  secrets: Record<string, string>
  onSetSecret: (key: string, value: string) => Promise<void>
  onSaveSlack: (config: SlackConfig) => Promise<void>
  onRemoveSlack: () => Promise<void>
}

export function IntegrationDetail({
  name,
  config,
  secrets,
  onSetSecret,
  onSaveSlack,
  onRemoveSlack,
}: IntegrationDetailProps) {
  if (name === 'github') return <GitHubDetail />
  if (name === 'linear') return <LinearDetail secrets={secrets} onSetSecret={onSetSecret} />
  if (name === 'slack') {
    return (
      <SlackDetail
        current={config?.slack ?? null}
        onSave={onSaveSlack}
        onRemove={onRemoveSlack}
      />
    )
  }
  return null
}

function GitHubDetail() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <Header icon={<Github className="h-4 w-4 text-orange-500" />} title="GitHub" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-zinc-400">
        <p>Parallax uses the GitHub CLI (<code className="text-orange-400">gh</code>) for authentication.</p>
        <p>Authenticate by running:</p>
        <pre className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200">gh auth login</pre>
        <p>
          Once authenticated, Parallax can read issues and open pull requests on your behalf.
          No additional configuration is needed here.
        </p>
        <a
          href="https://cli.github.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300"
        >
          GitHub CLI docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

function LinearDetail({
  secrets,
  onSetSecret,
}: {
  secrets: Record<string, string>
  onSetSecret: (key: string, value: string) => Promise<void>
}) {
  const hasKey = 'LINEAR_API_KEY' in secrets
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!value.trim()) { setError('API key is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSetSecret('LINEAR_API_KEY', value.trim())
      setValue('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <Header
        icon={<span className="text-[14px] leading-none text-orange-500">L</span>}
        title="Linear"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-zinc-600'}`}
          />
          <span className="text-zinc-400">
            {hasKey ? 'API key configured' : 'API key not set'}
          </span>
        </div>

        {error && (
          <div className="rounded border border-red-900 bg-red-950/20 px-3 py-2 text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500">
            {hasKey ? 'Update LINEAR_API_KEY' : 'LINEAR_API_KEY'}
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="lin_api_..."
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded border border-orange-700 bg-orange-950/60 px-3 py-1.5 text-xs text-orange-300 hover:text-orange-100 disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save key'}
        </button>

        <p className="text-zinc-500">
          Get your API key from{' '}
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-orange-400 hover:text-orange-300"
          >
            linear.app/settings/api
          </a>
          .
        </p>
      </div>
    </div>
  )
}

function SlackDetail({
  current,
  onSave,
  onRemove,
}: {
  current: SlackConfig | null | undefined
  onSave: (config: SlackConfig) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [botToken, setBotToken] = useState('')
  const [appToken, setAppToken] = useState('')
  const [channel, setChannel] = useState(current?.channel ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (botToken.trim() && !botToken.trim().startsWith('xoxb-')) { setError('Bot token must start with xoxb-'); return }
    if (appToken.trim() && !appToken.trim().startsWith('xapp-')) { setError('App token must start with xapp-'); return }
    if (!current && !botToken.trim()) { setError('Bot token is required.'); return }
    if (!current && !appToken.trim()) { setError('App token is required.'); return }
    if (!channel.trim()) { setError('Channel is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        botToken: botToken.trim() || current!.botToken,
        appToken: appToken.trim() || current!.appToken,
        channel: channel.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove()
      setBotToken('')
      setAppToken('')
      setChannel('')
      setConfirmRemove(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">Slack</span>
          {current && (
            <span className="ml-1 rounded bg-green-950/40 px-1.5 py-0.5 text-[10px] text-green-400 border border-green-900">
              Connected
            </span>
          )}
        </div>
        {current && (
          confirmRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-400">Disconnect Slack?</span>
              <button onClick={() => setConfirmRemove(false)} className="text-[11px] text-zinc-400 hover:text-zinc-200">No</button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="rounded border border-red-700 bg-red-950/60 px-2 py-1 text-[11px] text-red-300 hover:text-red-100 disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Yes'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-[11px] text-zinc-500 hover:text-red-400"
            >
              Disconnect
            </button>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
        {error && (
          <div className="rounded border border-red-900 bg-red-950/20 px-3 py-2 text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <FormField label={current ? 'Bot token (leave blank to keep existing)' : 'Bot token'}>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={current ? '(unchanged)' : 'xoxb-...'}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
            />
          </FormField>
          <FormField label={current ? 'App token (leave blank to keep existing)' : 'App token'}>
            <input
              type="password"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              placeholder={current ? '(unchanged)' : 'xapp-...'}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
            />
          </FormField>
          <FormField label="Channel">
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="#eng-ai"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
            />
          </FormField>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded border border-orange-700 bg-orange-950/60 px-3 py-1.5 text-xs text-orange-300 hover:text-orange-100 disabled:opacity-50"
        >
          {saving ? 'Saving…' : current ? 'Update' : 'Connect Slack'}
        </button>
      </div>
    </div>
  )
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-3">
      {icon}
      <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">{title}</span>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-zinc-500">{label}</label>
      {children}
    </div>
  )
}
