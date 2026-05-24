import { useState } from 'react'
import { Plus, Trash2, KeyRound } from 'lucide-react'
import { AddSecretModal } from './AddSecretModal'

interface SecretsEditorProps {
  secrets: Record<string, string>
  onSetSecret: (key: string, value: string) => Promise<void>
  onDeleteSecret: (key: string) => Promise<void>
}

export function SecretsEditor({ secrets, onSetSecret, onDeleteSecret }: SecretsEditorProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)

  const keys = Object.keys(secrets).sort()

  const handleDelete = async (key: string) => {
    setDeletingKey(key)
    try {
      await onDeleteSecret(key)
      setConfirmDeleteKey(null)
    } finally {
      setDeletingKey(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#060606] font-mono">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
            Secrets
          </span>
          <span className="text-[10px] text-zinc-600">— values are masked</span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-orange-700 hover:text-orange-400 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add secret
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
            <KeyRound className="mb-3 h-6 w-6 text-zinc-700" />
            <p className="text-xs text-zinc-500">No secrets configured.</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Add API keys and runtime environment variables here.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-300 hover:border-orange-700 hover:text-orange-400 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add your first secret
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {keys.map((key) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-zinc-200 truncate">{key}</span>
                  <span className="text-[11px] text-zinc-600 font-mono">•••••••</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {confirmDeleteKey === key ? (
                    <>
                      <span className="text-[11px] text-red-400">Delete?</span>
                      <button
                        onClick={() => setConfirmDeleteKey(null)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-200"
                      >
                        No
                      </button>
                      <button
                        onClick={() => handleDelete(key)}
                        disabled={deletingKey === key}
                        className="rounded border border-red-800 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-400 hover:text-red-200 disabled:opacity-50"
                      >
                        {deletingKey === key ? '…' : 'Yes'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteKey(key)}
                      className="text-zinc-600 hover:text-red-400"
                      title="Delete secret"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddSecretModal
          existingKeys={keys}
          onAdd={onSetSecret}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
