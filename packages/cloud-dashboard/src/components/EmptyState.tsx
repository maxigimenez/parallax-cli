import type { ReactNode } from 'react'
import { Text } from '@16-bits-design/ui/typography'

/**
 * Nothing here yet — and why, plus what to do about it.
 *
 * An empty table is ambiguous: it can mean the filter excluded everything, the
 * runner has not reported, or the feature was never set up. Each caller says
 * which, so the screen is never just blank.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}): ReactNode {
  return (
    <div className="px-empty">
      <div className="px-empty__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Text size="small">{title}</Text>
      {children ? (
        <Text size="caption" tone="muted" style={{ maxWidth: '46ch' }}>
          {children}
        </Text>
      ) : null}
      {action}
    </div>
  )
}
