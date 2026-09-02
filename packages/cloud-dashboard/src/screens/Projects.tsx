import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@16-bits-design/ui/badge'
import { Button } from '@16-bits-design/ui/button'
import { Dialog } from '@16-bits-design/ui/dialog'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import { CodeBlock } from '../components/CodeBlock.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import type { Project } from '../api/types.js'

export function Projects(): ReactNode {
  const key = useKey()
  const navigate = useNavigate()
  const { toast } = useToast()
  const projects = useResource((k, signal) => api.projects(k, signal), [])
  const [deleting, setDeleting] = useState<Project | undefined>(undefined)

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
      <PageHeader
        title="Projects"
        parent={{ label: 'Overview', to: '/' }}
        actions={<Button onClick={() => navigate('/projects/new')}>add project</Button>}
      />
      <Panel caption="Where triggers come from">
        {projects.loading ? (
          <Loading label="Loading projects" />
        ) : projects.error ? (
          <ErrorPanel message={projects.error} onRetry={projects.reload} />
        ) : (projects.data ?? []).length === 0 ? (
          <EmptyState
            title="No projects registered"
            action={
              <Button size="sm" onClick={() => navigate('/projects/new')}>
                add project
              </Button>
            }
          >
            The runner polls nothing until a project exists, so no route can ever fire.
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
                    <td>
                      <div className="px-rowactions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(project)}
                          aria-label={`Remove project ${project.id}`}
                        >
                          remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
