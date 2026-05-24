import { useState } from 'react'
import { X } from 'lucide-react'

interface AddSecretModalProps {
  existingKeys: string[]
  onAdd: (key: string, value: string) => Promise<void>
  onClose: () => void
}

export function AddSecretModal({ existingKeys, onAdd, onClose }: AddSecretModalProps) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isUpdate = existingKeys.includes(key.trim())

  const handleSave = async () => {
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()
    if (!trimmedKey) { setError('Key is required.'); return }
    if (/\s/.test(trimmedKey)) { setError('Key must not contain spaces.'); return }
    if (!trimmedValue) { setError('Value is required.'); return }

    setSaving(true)
    setError(null)
    try {
      await onAdd(trimmedKey, trimmedValue)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
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
            Add Secret
          </span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded border border-red-900 bg-red-950/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] text-zinc-500">
              Key <span className="ml-0.5 text-orange-500">*</span>
            </label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="LINEAR_API_KEY"
              autoFocus
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none font-mono"
            />
            {isUpdate && (
              <p className="text-[10px] text-amber-400">
                This key already exists. Saving will overwrite the current value.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-zinc-500">
              Value <span className="ml-0.5 text-orange-500">*</span>
            </label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="secret value"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-600 focus:outline-none"
            />
            <p className="text-[10px] text-zinc-600">
              Stored locally in ~/.parallax/config.json and injected as an env var at runtime.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded border border-orange-700 bg-orange-950/60 px-3 py-1.5 text-xs text-orange-300 hover:text-orange-100 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isUpdate ? 'Update secret' : 'Add secret'}
          </button>
        </div>
      </div>
    </div>
  )
}
