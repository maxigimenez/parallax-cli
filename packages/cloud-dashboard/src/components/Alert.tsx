import type { ReactNode } from 'react'

export type AlertTone = 'info' | 'warning' | 'danger'

const ICON: Record<AlertTone, string> = { info: 'i', warning: '!', danger: '!' }

/**
 * A persistent, in-place message.
 *
 * The library ships toasts, but a toast disappears, and the design system's own
 * guidance is that a toast must never be the only record of a blocking error.
 * A failed load, a stale runner or an unconfigured API URL all need to stay on
 * screen until the underlying condition changes, so they use this instead.
 *
 * `role="alert"` on the danger tone announces it; the softer tones do not
 * interrupt a screen reader mid-sentence for something merely informational.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: AlertTone
  title?: ReactNode
  children: ReactNode
  action?: ReactNode
}): ReactNode {
  return (
    <div
      className={`px-alert${tone === 'info' ? '' : ` px-alert--${tone}`}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className="px-alert__icon" aria-hidden="true">
        {ICON[tone]}
      </span>
      <div className="px-alert__body">
        {title ? <strong style={{ display: 'block' }}>{title}</strong> : null}
        {children}
      </div>
      {action}
    </div>
  )
}
