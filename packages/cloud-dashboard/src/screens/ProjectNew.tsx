import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@16-bits-design/ui/button'
import { Input } from '@16-bits-design/ui/input'
import { Select } from '@16-bits-design/ui/select'
import { Textarea } from '@16-bits-design/ui/textarea'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { Alert } from '../components/Alert.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'

/**
 * Registering a tracker for the runner to poll.
 *
 * `filters` is free-form JSON because the shape differs by provider and is
 * still moving. It is parsed here, with the cursor still in the field, rather
 * than sent for the API to reject.
 */
export function ProjectNew(): ReactNode {
  const key = useKey()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [id, setId] = useState('')
  const [provider, setProvider] = useState('github')
  const [filters, setFilters] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

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
      navigate('/projects')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Add project" parent={{ label: 'Projects', to: '/projects' }} />
      <Panel caption="Where triggers come from">
        <div className="px-panel__body">
          <Section title="Project">
            <div className="px-form">
              <div className="px-form__row">
                <Input
                  label="Project id"
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                  hint="owner/repo for GitHub, or the team key for Linear."
                  placeholder="acme/platform"
                  autoFocus
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
                rows={5}
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
                <Button variant="ghost" onClick={() => navigate('/projects')} disabled={saving}>
                  cancel
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </Panel>
    </>
  )
}
