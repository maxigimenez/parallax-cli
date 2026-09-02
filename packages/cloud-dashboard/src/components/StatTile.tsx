import type { ReactNode } from 'react'
import { Meter } from '@16-bits-design/ui/meter'
import { Text } from '@16-bits-design/ui/typography'

export type StatTone = 'primary' | 'amber' | 'success' | 'danger'

const SWATCH: Record<StatTone, string> = {
  primary: 'var(--bits-primary)',
  amber: 'var(--bits-amber)',
  success: 'var(--bits-success)',
  danger: 'var(--bits-danger)',
}

/**
 * One counted thing, with its share of the whole.
 *
 * The meter is the count against the total across all tiles, which is a real
 * proportion rather than decoration — four bars that always read full would say
 * nothing. When there is nothing at all the meter reads zero rather than being
 * hidden, so the tiles keep the same height between an empty and a busy org.
 */
export function StatTile({
  label,
  value,
  total,
  tone,
  note,
}: {
  label: string
  value: number
  total: number
  tone: StatTone
  note: string
}): ReactNode {
  return (
    <div className="px-stat">
      <span className="px-stat__label">
        <span className="px-stat__swatch" style={{ background: SWATCH[tone] }} aria-hidden="true" />
        {label}
      </span>
      <span className="px-stat__value" style={{ color: SWATCH[tone] }}>
        {value}
      </span>
      <Meter
        value={value}
        max={Math.max(total, 1)}
        segments={12}
        tone={tone}
        label={`${label}: ${value} of ${total}`}
      />
      <Text size="caption" tone="muted" className="px-stat__note">
        {note}
      </Text>
    </div>
  )
}
