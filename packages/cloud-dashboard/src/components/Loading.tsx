import type { ReactNode } from 'react'
import { Text } from '@16-bits-design/ui/typography'

/**
 * The wait state for a panel that has nothing to show yet.
 *
 * The bar scans rather than filling: the request has no measurable progress, and
 * a bar that creeps toward a finish it cannot predict is a lie. The label is a
 * live region so the wait is announced rather than only animated.
 */
export function Loading({ label = 'Loading' }: { label?: string }): ReactNode {
  return (
    <div className="px-loading">
      <div className="px-loading__track" aria-hidden="true">
        <span className="px-loading__bar" />
      </div>
      <Text size="caption" tone="muted" role="status" aria-live="polite">
        {label}…
      </Text>
    </div>
  )
}
