import { useState, type ReactNode } from 'react'
import { Badge } from '@16-bits-design/ui/badge'
import { Button } from '@16-bits-design/ui/button'
import { Dialog } from '@16-bits-design/ui/dialog'
import { Input } from '@16-bits-design/ui/input'
import { Select } from '@16-bits-design/ui/select'
import { Textarea } from '@16-bits-design/ui/textarea'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import { Alert } from '../components/Alert.js'
import { CodeBlock } from '../components/CodeBlock.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'
import type { Project } from '../api/types.js'

/**
 * The trackers the runner polls.
 *
 * `filters` is free-form JSON because the runner's filter shape differs by
 * provider and is still moving. It is parsed before submitting so a typo is
 * caught here, with the cursor still in the field, rather than as a 400.
 */
export function Projects(): ReactNode {
  const key = useKey()
  const { toast } = useToast()
  const projects = useResource((k, signal) => api.projects(k, signal), [])

  const [id, setId] = useState('')
  const [provider, setProvider] = useState('github')
  const [filters, setFilters] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [deleting, setDeleting] = useState<Project | undefined>(undefined)

  const create = async (): Promise<void> => {
    if (!id.trim()) {
      setError('A project id is required — the repository slug, or the Linear team key.')
      return
    }
    let parsed: unknown
    try {
      parsed = filters.trim() ? JSON.parse(filters) : {}
    } catch {
      setError('Filters must be valid JSON. Use {} for no filtering.')
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      await api.createProject(key, { id: id.trim(), provider, filters: parsed })
      toast({
        tone: 'success',
        title: 'Project saved',
        message: `${id.trim()} will be polled from the runner's next cycle.`,
      })
      setId('')
      setFilters('{}')
      projects.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (project: Project): Promise<void> => {
    try {
      await api.deleteProject(key, project.id)
      toast({
        tone: 'success',
        title: 'Project removed',
        message: `${project.id} is no longer polled.`,
      })
      projects.reload()
    } catch (cause) {
      toast({
        tone: 'danger',
        title: 'Could not remove the project',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return (
    <>
      <PageHeader title="Projects" parent={{ label: 'Overview', to: '/' }} />
      <Panel caption="Where triggers come from">
        <div className="px-panel__body">
          <Section title="Add a project">
            <div className="px-form">
              <div className="px-form__row">
                <Input
                  label="Project id"
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                  hint="owner/repo for GitHub, or the team key for Linear."
                  placeholder="acme/platform"
                />
                <Select
                  label="Provider"
                  value={provider}
                  onValueChange={setProvider}
                  options={[
                    { value: 'github', label: 'GitHub' },
                    { value: 'linear', label: 'Linear' },
                  ]}
                />
              </div>
              <Textarea
                label="Filters"
                rows={4}
                value={filters}
                onChange={(event) => setFilters(event.target.value)}
                hint="JSON passed to the trigger source. Use {} to poll everything."
              />
              {error ? (
                <Alert tone="danger" title="The project was not saved">
                  {error}
                </Alert>
              ) : null}
              <div className="px-form__actions">
                <Button onClick={() => void create()} loading={saving} loadingLabel="saving">
                  save project
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Registered projects" padded={false}>
            {projects.loading ? (
              <Loading label="Loading projects" />
            ) : projects.error ? (
              <ErrorPanel message={projects.error} onRetry={projects.reload} />
            ) : (projects.data ?? []).length === 0 ? (
              <EmptyState title="No projects registered">
                The runner polls nothing until a project exists, so no route can ever fire. Add one
                above.
              </EmptyState>
            ) : (
              <div className="px-tablewrap">
                <table className="px-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Filters</th>
                      <th scope="col">
                        <span className="px-visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projects.data ?? []).map((project) => (
                      <tr key={project.id}>
                        <td>
                          <span className="px-cell__primary">{project.id}</span>
                        </td>
                        <td>
                          <Badge tone="outline">{project.provider}</Badge>
                        </td>
                        <td>
                          <CodeBlock label={`Filters for ${project.id}`}>
                            {JSON.stringify(project.filters ?? {}, null, 2)}
                          </CodeBlock>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(project)}
                            aria-label={`Remove project ${project.id}`}
                          >
                            remove
                          </Button>
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
        title="Remove this project"
        description="The runner stops polling it, so no route can fire from it again. Existing runs are kept."
        meta={deleting?.id}
        confirmLabel="remove project"
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
