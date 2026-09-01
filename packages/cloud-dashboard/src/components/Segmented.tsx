import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * A one-of-several filter.
 *
 * Buttons with `aria-pressed`, not a radio group: these apply immediately and
 * submit nothing, and each is individually reachable by Tab, which is the
 * behaviour someone scanning a filter bar expects.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}): ReactNode {
  return (
    <div className="px-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="px-segmented__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
