import { useState, type ReactNode } from 'react'
import { Badge } from '@16-bits-design/ui/badge'
import { Button } from '@16-bits-design/ui/button'
import { Dialog } from '@16-bits-design/ui/dialog'
import { Input } from '@16-bits-design/ui/input'
import { Select } from '@16-bits-design/ui/select'
import { Text } from '@16-bits-design/ui/typography'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey, useSession } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import { relativeTime } from '../lib/format.js'
import { Alert } from '../components/Alert.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'
import { SecretValue } from '../components/SecretValue.js'
import type { ApiKey } from '../api/types.js'

/**
 * Minting and revoking keys.
 *
 * A freshly minted key is shown once, in a panel that stays until dismissed,
 * because the API never returns the plaintext again — a toast that timed out
 * would lose it for good. The key currently signed in with is marked and cannot
 * be revoked from here, since doing so would end the session mid-action and
 * leave no way back in.
 */
export function AccessKeys(): ReactNode {
  const key = useKey()
  const { session } = useSession()
  const { toast } = useToast()
  const keys = useResource((k, signal) => api.keys(k, signal), [])

  const [name, setName] = useState('')
  const [scope, setScope] = useState<'runner' | 'user'>('user')
  const [minted, setMinted] = useState<{ key: string; name: string } | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [revoking, setRevoking] = useState<ApiKey | undefined>(undefined)

  const create = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Name the key after where it will live, so it can be revoked without guessing.')
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const created = await api.createKey(key, { name: name.trim(), scope })
      setMinted({ key: created.key, name: name.trim() })
      setName('')
      keys.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (target: ApiKey): Promise<void> => {
    try {
      await api.revokeKey(key, target.id)
      toast({
        tone: 'success',
        title: 'Key revoked',
        message: `${target.name} stops working immediately.`,
      })
      keys.reload()
    } catch (cause) {
      toast({
        tone: 'danger',
        title: 'Could not revoke the key',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const active = (keys.data ?? []).filter((entry) => !entry.revoked_at)

  return (
    <>
      <PageHeader title="Access keys" parent={{ label: 'Overview', to: '/' }} />
      <Panel caption="Credentials for runners and for people">
        <div className="px-panel__body">
          {minted ? (
            <Alert tone="warning" title="Copy this key now">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span>
                  This is the only time <strong>{minted.name}</strong> is shown. The API stores only
                  a hash, so it cannot be recovered — mint a replacement if it is lost.
                </span>
                <SecretValue value={minted.key} label={minted.name} />
                <div>
                  <Button size="sm" variant="secondary" onClick={() => setMinted(undefined)}>
                    done
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}

          <Section title="Mint a key">
            <div className="px-form">
              <div className="px-form__row">
                <Input
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="cerebro runner"
                  hint="Where this key will be used."
                />
                <Select
                  label="Scope"
                  value={scope}
                  onValueChange={(value) => setScope(value as 'runner' | 'user')}
                  options={[
                    { value: 'user', label: 'User — dashboard and API' },
                    { value: 'runner', label: 'Runner — the orchestrator daemon' },
                  ]}
                />
              </div>
              <Text size="caption" tone="muted">
                Scopes do not overlap. A runner key is refused on these screens, and a user key is
                refused by the runner.
              </Text>
              {error ? (
                <Alert tone="danger" title="The key was not created">
                  {error}
                </Alert>
              ) : null}
              <div className="px-form__actions">
                <Button onClick={() => void create()} loading={saving} loadingLabel="minting">
                  generate key
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Active keys" padded={false}>
            {keys.loading ? (
              <Loading label="Loading keys" />
            ) : keys.error ? (
              <ErrorPanel message={keys.error} onRetry={keys.reload} />
            ) : active.length === 0 ? (
              <EmptyState title="No active keys">Mint one above to get started.</EmptyState>
            ) : (
              <div className="px-tablewrap">
                <table className="px-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Key</th>
                      <th scope="col">Scope</th>
                      <th scope="col">Last used</th>
                      <th scope="col">
                        <span className="px-visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((entry) => {
                      const isCurrent = entry.id === session?.me.key.id
                      return (
                        <tr key={entry.id}>
                          <td>
                            <span className="px-cell">
                              <span className="px-cell__primary">{entry.name}</span>
                              <span className="px-cell__secondary">
                                created {relativeTime(entry.created_at)}
                              </span>
                            </span>
                          </td>
                          <td>
                            <code className="px-secret__value">{entry.prefix}…</code>
                          </td>
                          <td>
                            <Badge tone={entry.scope === 'runner' ? 'amber' : 'primary'}>
                              {entry.scope}
                            </Badge>
                          </td>
                          <td>
                            <Text size="small" tone="muted">
                              {relativeTime(entry.last_used_at)}
                            </Text>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isCurrent ? (
                              <Badge tone="outline">this session</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRevoking(entry)}
                                aria-label={`Revoke key ${entry.name}`}
                              >
                                revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </Panel>

      <Dialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(undefined)}
        tone="danger"
        icon="!"
        title="Revoke this key"
        description="Anything using it starts failing immediately, including a runner mid-poll. This cannot be undone; mint a replacement instead."
        meta={revoking?.name}
        confirmLabel="revoke key"
        cancelLabel="keep it"
        onConfirm={() => {
          if (revoking) {
            void revoke(revoking)
          }
          setRevoking(undefined)
        }}
      />
    </>
  )
}
