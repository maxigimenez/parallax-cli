import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@16-bits-design/ui/button'
import { Input } from '@16-bits-design/ui/input'
import { Select } from '@16-bits-design/ui/select'
import { Text } from '@16-bits-design/ui/typography'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { Alert } from '@16-bits-design/ui/alert'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'
import { SecretValue } from '../components/SecretValue.js'

/**
 * Minting a key.
 *
 * The plaintext is shown once and never again — the API stores only a hash — so
 * it stays on this page until dismissed rather than in a toast that times out,
 * and the page does not navigate away on success.
 */
export function KeyNew(): ReactNode {
  const key = useKey()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [scope, setScope] = useState<'runner' | 'user'>('user')
  const [minted, setMinted] = useState<{ key: string; name: string } | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Generate key" parent={{ label: 'Access keys', to: '/keys' }} />
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
                <div className="px-form__actions">
                  <Button size="sm" onClick={() => navigate('/keys')}>
                    done
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMinted(undefined)}>
                    mint another
                  </Button>
                </div>
              </div>
            </Alert>
          ) : (
            <Section title="New key">
              <div className="px-form">
                <div className="px-form__row">
                  <Input
                    label="Name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="cerebro runner"
                    hint="Where this key will be used."
                    autoFocus
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
                  <Button variant="ghost" onClick={() => navigate('/keys')} disabled={saving}>
                    cancel
                  </Button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </Panel>
    </>
  )
}
