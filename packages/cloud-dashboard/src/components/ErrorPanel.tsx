import type { ReactNode } from 'react'
import { Button } from '@16-bits-design/ui/button'
import { Alert } from '@16-bits-design/ui/alert'

/** A failed load, with the one action that might fix it. */
export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): ReactNode {
  return (
    <div style={{ padding: 18 }}>
      <Alert
        tone="danger"
        title="Could not load this"
        action={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            retry
          </Button>
        }
      >
        {message}
      </Alert>
    </div>
  )
}
