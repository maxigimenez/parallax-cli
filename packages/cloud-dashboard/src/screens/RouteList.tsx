import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@16-bits-design/ui/badge'
import { Button } from '@16-bits-design/ui/button'
import { Dialog } from '@16-bits-design/ui/dialog'
import { Input } from '@16-bits-design/ui/input'
import { Select } from '@16-bits-design/ui/select'
import { Textarea } from '@16-bits-design/ui/textarea'
import { Text } from '@16-bits-design/ui/typography'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import { fillRouteTemplate, missingPlaceholders } from '../lib/routeTemplate.js'
import { Alert } from '../components/Alert.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'
import type { RoutingRule } from '../api/types.js'

/**
 * Routes: what exists, and a form to add one.
 *
 * Creating starts from a template rather than an empty form. A route has a
 * trigger, a match, a target, an execution and an outcome, and the combinations
 * that actually fire are a small subset of the ones the schema permits — the
 * catalog is that subset, verified in CI. So the form asks only for the values
 * a template declares as placeholders, plus the prompt, and sends the rest as
 * the catalog wrote it.
 */
export function RouteList(): ReactNode {
  const key = useKey()
  const { toast } = useToast()
  const routes = useResource((k, signal) => api.routes(k, signal), [])
  const templates = useResource((k, signal) => api.routeTemplates(k, signal), [])

  const [templateId, setTemplateId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [deleting, setDeleting] = useState<RoutingRule | undefined>(undefined)

  const template = useMemo(
    () => (templates.data ?? []).find((entry) => entry.id === templateId),
    [templates.data, templateId]
  )

  const pickTemplate = (id: string): void => {
    const picked = (templates.data ?? []).find((entry) => entry.id === id)
    setTemplateId(id)
    setValues({})
    setFormError(undefined)
    // Prefilling name and prompt is the point of a template: the user edits
    // what they want changed instead of composing a route from nothing.
    setName(picked?.route.name ?? '')
    setPrompt(picked?.route.execution.prompt ?? '')
  }

  const create = async (): Promise<void> => {
    if (!template) {
      return
    }
    const missing = missingPlaceholders(template, values)
    if (missing.length > 0) {
      setFormError(`Fill in ${missing.join(', ')} before creating this route.`)
      return
    }
    if (!name.trim()) {
      setFormError('Give the route a name you will recognise in the run list.')
      return
    }
    setSaving(true)
    setFormError(undefined)
    try {
      const route = fillRouteTemplate(template, values)
      await api.createRoute(key, {
        ...route,
        name: name.trim(),
        execution: { ...route.execution, prompt },
      })
      toast({
        tone: 'success',
        title: 'Route created',
        message: `${name.trim()} will be picked up on the runner's next poll.`,
      })
      setTemplateId('')
      setValues({})
      setName('')
      setPrompt('')
      routes.reload()
    } catch (error) {
      // Stays on screen rather than only in a toast: the form still holds the
      // user's input, and the message says which field the API refused.
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (route: RoutingRule): Promise<void> => {
    try {
      await api.deleteRoute(key, route.id)
      toast({
        tone: 'success',
        title: 'Route deleted',
        message: `${route.name} will not fire again.`,
      })
      routes.reload()
    } catch (error) {
      toast({
        tone: 'danger',
        title: 'Could not delete the route',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <>
      <PageHeader title="Routes" parent={{ label: 'Overview', to: '/' }} />
      <Panel caption="When this happens, start that agent">
        <div className="px-panel__body">
          <Section title="New route">
            {templates.loading ? (
              <Loading label="Loading templates" />
            ) : templates.error ? (
              <ErrorPanel message={templates.error} onRetry={templates.reload} />
            ) : (
              <div className="px-form">
                <Select
                  label="Start from"
                  placeholder="Pick a supported case"
                  value={templateId}
                  onValueChange={pickTemplate}
                  options={(templates.data ?? []).map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                  }))}
                />

                {template ? (
                  <>
                    <Text size="small" tone="muted">
                      {template.description}
                    </Text>

                    <Input
                      label="Route name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      hint="Shown on every run this route starts."
                    />

                    <div className="px-form__row">
                      {template.placeholders.map((placeholder) => (
                        <Input
                          key={placeholder.token}
                          label={placeholder.label}
                          hint={placeholder.hint}
                          value={values[placeholder.token] ?? ''}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [placeholder.token]: event.target.value,
                            }))
                          }
                        />
                      ))}
                    </div>

                    <Textarea
                      label="Prompt"
                      rows={10}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      hint="{{variables}} are filled in by the runner at dispatch. Unknown ones stay visible rather than blanking."
                    />

                    {formError ? (
                      <Alert tone="danger" title="The route was not created">
                        {formError}
                      </Alert>
                    ) : null}

                    <div className="px-form__actions">
                      <Button
                        onClick={() => void create()}
                        loading={saving}
                        loadingLabel="creating"
                      >
                        create route
                      </Button>
                      <Button variant="ghost" onClick={() => pickTemplate('')} disabled={saving}>
                        discard
                      </Button>
                    </div>
                  </>
                ) : (
                  <Text size="small" tone="muted">
                    Every template is a complete route, checked against the API&apos;s own
                    validator. Pick one and fill in what it asks for.
                  </Text>
                )}
              </div>
            )}
          </Section>

          <Section title="Live routes" padded={false}>
            {routes.loading ? (
              <Loading label="Loading routes" />
            ) : routes.error ? (
              <ErrorPanel message={routes.error} onRetry={routes.reload} />
            ) : (routes.data ?? []).length === 0 ? (
              <EmptyState title="No routes yet">
                Nothing will start an agent until a route exists. Create one above.
              </EmptyState>
            ) : (
              <div className="px-tablewrap">
                <table className="px-table">
                  <thead>
                    <tr>
                      <th scope="col">Route</th>
                      <th scope="col">Trigger</th>
                      <th scope="col">Agent</th>
                      <th scope="col" className="px-table__num">
                        Priority
                      </th>
                      <th scope="col">
                        <span className="px-visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(routes.data ?? []).map((route) => (
                      <tr key={route.id}>
                        <td>
                          <span className="px-cell">
                            <span className="px-cell__primary">{route.name}</span>
                            <span className="px-cell__secondary">{route.id}</span>
                          </span>
                        </td>
                        <td>
                          <span className="px-cell">
                            <span className="px-cell__primary">{route.trigger.type}</span>
                            <span className="px-cell__secondary">
                              {route.trigger.projectId ?? 'any project'}
                            </span>
                          </span>
                        </td>
                        <td>
                          <Text size="small" tone="soft">
                            {route.target.agentRef?.profile ??
                              route.target.agentRef?.githubLogin ??
                              '—'}
                          </Text>
                        </td>
                        <td className="px-table__num">
                          <Text size="small" tone="soft">
                            {route.priority}
                          </Text>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Badge tone={route.enabled ? 'success' : 'neutral'}>
                              {route.enabled ? 'enabled' : 'disabled'}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleting(route)}
                              aria-label={`Delete route ${route.name}`}
                            >
                              delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </Panel>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        tone="danger"
        icon="!"
        title="Delete this route"
        description="It stops firing immediately. Runs it already started are kept, and nothing they did is undone."
        meta={deleting?.name}
        confirmLabel="delete route"
        cancelLabel="keep it"
        onConfirm={() => {
          if (deleting) {
            void remove(deleting)
          }
          setDeleting(undefined)
        }}
      />
    </>
  )
}
