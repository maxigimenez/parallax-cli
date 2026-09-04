import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@16-bits-design/ui/button'
import { Input } from '@16-bits-design/ui/input'
import { Text } from '@16-bits-design/ui/typography'
import { ApiError, verifyKey } from '../api/client.js'
import { API_URL, IS_CONFIGURED } from '../config.js'
import { useSession } from '../lib/session.js'
import { Alert } from '@16-bits-design/ui/alert'
import { BrandMark } from '../components/BrandMark.js'

/**
 * The whole of signing in: paste a user key.
 *
 * The key is verified against `/v1/me` before it is stored, so a bad key fails
 * here with a message rather than being kept and failing on every screen after
 * it. A runner key presents as a 401 — the API refuses runner scope on user
 * routes — and the copy names that case, because pasting the wrong one of two
 * similar-looking keys is the likeliest mistake.
 */
export function Login(): ReactNode {
  const { signIn } = useSession()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const key = value.trim()
    if (!key) {
      setError('Paste an access key to continue.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const me = await verifyKey(key)
      signIn(key, me)
    } catch (cause) {
      if (cause instanceof ApiError && cause.unauthorized) {
        setError(
          'That key was rejected. User keys start with prx_usr_ — a runner key will not work here.'
        )
      } else {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      setBusy(false)
    }
  }

  return (
    <div className="px-login">
      <form className="px-login__card" onSubmit={(event) => void submit(event)}>
        <div className="px-login__rule" />
        <div className="px-login__body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="px-login__brand">
              <BrandMark className="px-sidebar__mark" />
              <img
                src="/brand/sentinel0-wordmark.svg"
                alt="sentinel0"
                className="px-sidebar__wordmark"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <h1
                style={{
                  fontFamily: 'var(--bits-font-display)',
                  fontSize: 'var(--bits-font-size-h3)',
                  margin: 0,
                  fontWeight: 400,
                }}
              >
                access key
              </h1>
              <Text size="small" tone="muted">
                Paste a user key from your organization. It is kept in this browser only.
              </Text>
            </div>
          </div>

          {IS_CONFIGURED ? null : (
            <Alert tone="danger" title="No API URL configured">
              This dashboard was served without <code>PARALLAX_API_URL</code>, so it has nothing to
              sign in to. Set it on the service and redeploy.
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label="Key"
              name="key"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder="prx_usr_…"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(undefined)
              }}
              error={error}
            />
            <Button
              type="submit"
              loading={busy}
              loadingLabel="verifying key"
              disabled={!IS_CONFIGURED}
            >
              unlock workspace
            </Button>
            <div className="px-login__hint">
              <Text size="small" tone="muted">
                No key yet? Mint one with <code>node dist/org-cli.js</code> on the control plane, or
                from Access keys if you already have one.
              </Text>
            </div>
          </div>
        </div>
        <div className="px-login__foot">
          <span>sentinel0_</span>
          <span style={{ textTransform: 'none', letterSpacing: '0.04em' }}>
            {API_URL || 'no api url'}
          </span>
        </div>
      </form>
    </div>
  )
}
