import { useState, type ReactNode } from 'react'
import { Button } from '@16-bits-design/ui/button'

/**
 * A credential, hidden until asked for.
 *
 * Masked by default because these screens get shared and screenshotted, and
 * `type=password` is wrong here: the value is not being entered, and a password
 * field would invite a manager to save it.
 *
 * The copy button degrades rather than lying — over plain HTTP, or in a browser
 * that refuses clipboard access, it reports that it could not copy and the
 * value stays selectable.
 */
export function SecretValue({ value, label }: { value: string; label: string }): ReactNode {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  const masked = `${value.slice(0, 12)}${'•'.repeat(10)}`

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
    setTimeout(() => setCopied('idle'), 2000)
  }

  return (
    <div className="px-secret">
      <code className="px-secret__value">{shown ? value : masked}</code>
      <Button size="sm" variant="ghost" onClick={() => setShown(!shown)}>
        {shown ? 'hide' : 'reveal'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        {copied === 'done' ? 'copied' : copied === 'failed' ? 'copy failed' : 'copy'}
      </Button>
      <span role="status" aria-live="polite" className="px-visually-hidden">
        {copied === 'done'
          ? `${label} copied`
          : copied === 'failed'
            ? `Could not copy ${label}`
            : ''}
      </span>
    </div>
  )
}
