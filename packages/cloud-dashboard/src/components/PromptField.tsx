import { useRef, type ReactNode } from 'react'
import { Textarea } from '@16-bits-design/ui/textarea'
import { Text } from '@16-bits-design/ui/typography'

/**
 * The prompt, and the variables it may use.
 *
 * Listing them matters more than it looks: the runner leaves an unrecognised
 * `{{placeholder}}` visible rather than blanking it, precisely so a typo cannot
 * become a confidently wrong run — but that only helps if the writer knows
 * which names are real. Clicking one inserts it at the cursor, so the exact
 * spelling never has to be typed.
 */
export function PromptField({
  value,
  onChange,
  variables,
  error,
}: {
  value: string
  onChange: (value: string) => void
  variables: string[]
  error?: string
}): ReactNode {
  const field = useRef<HTMLTextAreaElement>(null)

  const insert = (variable: string): void => {
    const token = `{{${variable}}}`
    const element = field.current
    if (!element) {
      onChange(value + token)
      return
    }
    // Insert at the caret rather than appending, and leave the caret after the
    // inserted token so a second click does not land back at the start.
    const start = element.selectionStart ?? value.length
    const end = element.selectionEnd ?? start
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="px-form">
      <Textarea
        ref={field}
        label="Prompt"
        rows={12}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        hint="What the agent is asked to do. Parallax appends a request for a PARALLAX_SUMMARY line unless yours already mentions one."
      />
      <div className="px-vars">
        <Text size="caption" tone="muted" as="span" id="px-vars-label">
          Variables — the runner fills these in at dispatch. Click to insert.
        </Text>
        <div className="px-vars__list" role="group" aria-labelledby="px-vars-label">
          {variables.map((variable) => (
            <button
              key={variable}
              type="button"
              className="px-vars__chip"
              onClick={() => insert(variable)}
              title={`Insert {{${variable}}}`}
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
        <Text size="caption" tone="faint">
          An unrecognised name is left visible in the prompt and logged, never blanked.
        </Text>
      </div>
    </div>
  )
}
