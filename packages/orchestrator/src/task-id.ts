import { createHash } from 'node:crypto'

export function createTaskId(projectId: string, externalId: string): string {
  const normalizedProjectId = projectId.trim().toLowerCase()
  const normalizedExternalId = externalId.trim()
  return createHash('sha256')
    .update(`${normalizedProjectId}::${normalizedExternalId}`)
    .digest('hex')
    .slice(0, 12)
}
