import type { ReactNode } from 'react'

/**
 * Preformatted text that must not reflow — a route definition, an error, a
 * prompt. Scrolls inside itself so a long line never widens the page.
 */
export function CodeBlock({ children, label }: { children: string; label?: string }): ReactNode {
  return (
    <pre className="px-code" tabIndex={0} role="group" aria-label={label ?? 'Code'}>
      {children}
    </pre>
  )
}
