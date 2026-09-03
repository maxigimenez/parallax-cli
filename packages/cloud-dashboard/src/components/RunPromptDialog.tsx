import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert } from '@16-bits-design/ui/alert'
import { Button } from '@16-bits-design/ui/button'
import { Select } from '@16-bits-design/ui/select'
import { Spinner } from '@16-bits-design/ui/spinner'
import { Textarea } from '@16-bits-design/ui/textarea'
import { Text } from '@16-bits-design/ui/typography'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import type { Agent, Runner } from '../api/types.js'

/**
 * Start an agent on a prompt written here, without a route.
 *
 * Routes answer "when something happens, do this"; this answers "do this, now".
 * The two are deliberately separate: a one-off question does not need a rule
 * that outlives it, and creating a throwaway route to ask one — then remembering
 * to delete it — is how a route table fills with things nobody dares turn off.
 *
 * Built here rather than on the library's `Dialog`, which is a confirmation: it
 * renders its `description` in a `<p>`, so form controls inside it would be
 * reparented by the browser, and its focus trap looks only for buttons, links
 * and inputs — not a `select` or a `textarea`. Filed upstream as
 * maxigimenez/16-bits-design#21; this is a candidate to delete when a
 * composable dialog lands.
 */
export function RunPromptDialog({
  open,
  onClose,
  onQueued,
}: {
  open: boolean
  onClose: () => void
  onQueued: (runner: string) => void
}): ReactNode {
  const key = useKey()
  const panel = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const runners = useResource((k, signal) => api.runners(k, signal), [])
  const agents = useResource((k, signal) => api.agents(k, signal), [])

  const [runnerName, setRunnerName] = useState('')
  const [profile, setProfile] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const loading = runners.loading || agents.loading
  const allRunners: Runner[] = useMemo(() => runners.data ?? [], [runners.data])
  const allAgents: Agent[] = useMemo(() => agents.data ?? [], [agents.data])

  /*
   * Only agents on the chosen runner, and only enabled ones.
   *
   * A profile lives on one machine. Offering the whole pool and resolving it
   * server-side would let someone pick an agent the selected runner has never
   * heard of, and the command would sit in the queue unanswered.
   */
  const available = useMemo(
    () => allAgents.filter((agent) => agent.enabled && agent.runner === runnerName),
    [allAgents, runnerName]
  )

  // Default to the first runner that is actually checking in: queueing work for
  // a runner that stopped polling is the one choice guaranteed to do nothing.
  useEffect(() => {
    if (!open || runnerName || allRunners.length === 0) {
      return
    }
    setRunnerName((allRunners.find((runner) => !runner.stale) ?? allRunners[0]).name)
  }, [allRunners, open, runnerName])

  // Keep the agent consistent with the runner: switching machines must not
  // leave a profile selected that the new one does not have.
  useEffect(() => {
    if (!available.some((agent) => agent.profile === profile)) {
      setProfile(available[0]?.profile ?? '')
    }
  }, [available, profile])

  useEffect(() => {
    if (!open) {
      return
    }
    previousFocus.current = document.activeElement as HTMLElement | null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) {
        return
      }
      // Focus stays inside a modal, so Tab cannot land on the page behind it.
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
        ),
      ]
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus()
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  const chosenRunner = allRunners.find((runner) => runner.name === runnerName)

  const submit = async (): Promise<void> => {
    if (!chosenRunner || !profile || !prompt.trim()) {
      setError('Choose a runner and an agent, and write a prompt.')
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      const { runner } = await api.startRun(key, {
        runnerId: chosenRunner.id,
        agentProfile: profile,
        prompt: prompt.trim(),
      })
      setPrompt('')
      onQueued(runner)
      onClose()
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-modal">
      <button
        type="button"
        className="px-modal__backdrop"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panel}
        className="px-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="px-run-title"
      >
        <div className="px-modal__head">
          <h2 className="px-modal__title" id="px-run-title">
            Run an agent
          </h2>
          <button
            type="button"
            className="px-modal__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="px-modal__body">
          {loading ? (
            <Spinner label="Loading runners and agents" />
          ) : (
            <>
              <Text size="caption" tone="muted">
                The agent starts on this prompt directly — no route, no ticket, no trigger. It
                appears in the run list once the runner picks the command up.
              </Text>

              <Select
                label="Runner"
                value={runnerName}
                onValueChange={setRunnerName}
                placeholder="Choose a runner"
                options={allRunners.map((runner) => ({
                  value: runner.name,
                  // A stale runner is not hidden — it is named as stale. Hiding
                  // it would present "no runners" for what is really "the runner
                  // stopped checking in", which are different problems.
                  label: runner.stale ? `${runner.name} — not checking in` : runner.name,
                }))}
              />

              <Select
                label="Agent"
                value={profile}
                onValueChange={setProfile}
                placeholder={
                  available.length === 0 ? 'No enabled agents on this runner' : 'Choose an agent'
                }
                disabled={available.length === 0}
                options={available.map((agent) => ({
                  value: agent.profile,
                  label: agent.display_name
                    ? `${agent.display_name} (${agent.profile})`
                    : agent.profile,
                }))}
              />

              <Textarea
                label="Prompt"
                rows={10}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                hint="Sent to the agent as written. Route placeholders like {{ticket.ref}} are not substituted here — there is no ticket behind this run."
              />

              {allRunners.length === 0 ? (
                <Alert tone="warning" title="No runner has registered">
                  Start one with <code>parallax start</code> on the machine running Hermes.
                </Alert>
              ) : null}

              {chosenRunner?.stale ? (
                <Alert tone="warning" title="That runner is not checking in">
                  The command will be queued and delivered whenever it polls again.
                </Alert>
              ) : null}

              {error ? (
                <Alert tone="danger" title="The run was not queued">
                  {error}
                </Alert>
              ) : null}
            </>
          )}
        </div>

        <div className="px-modal__foot">
          <Button variant="secondary" onClick={onClose}>
            cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={submitting}
            loadingLabel="queueing"
            disabled={loading || !chosenRunner || !profile || prompt.trim().length === 0}
          >
            start run
          </Button>
        </div>
      </div>
    </div>
  )
}
