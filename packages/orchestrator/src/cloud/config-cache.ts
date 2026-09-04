import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectConfig, RoutingRule } from '@sentinel0/common'

const ROUTES_FILE = 'routes.json'
const PROJECTS_FILE = 'projects.json'

/**
 * Last known good copies of the cloud's configuration.
 *
 * These exist so a cloud outage degrades the runner to "keep doing what it was
 * doing" rather than "silently stop dispatching". With no cloud configured at
 * all they are also the configuration surface itself, which is what makes the
 * trigger engine testable on a machine before any control plane exists.
 */

async function readCache<T>(dataDir: string, file: string, key: string): Promise<T[]> {
  let raw: string
  try {
    raw = await fs.readFile(path.join(dataDir, file), 'utf8')
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const parsed = JSON.parse(raw) as unknown
  const items = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>)[key] ?? [])

  if (!Array.isArray(items)) {
    throw new Error(`Invalid ${file} in ${dataDir}: expected an array of ${key}.`)
  }
  return items as T[]
}

async function writeCache(dataDir: string, file: string, payload: unknown): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const target = path.join(dataDir, file)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2))
  await fs.rename(tmp, target)
}

export function routeCachePath(dataDir: string): string {
  return path.join(dataDir, ROUTES_FILE)
}

export function projectCachePath(dataDir: string): string {
  return path.join(dataDir, PROJECTS_FILE)
}

export function loadCachedRoutes(dataDir: string): Promise<RoutingRule[]> {
  return readCache<RoutingRule>(dataDir, ROUTES_FILE, 'routes')
}

export function saveCachedRoutes(dataDir: string, routes: RoutingRule[]): Promise<void> {
  return writeCache(dataDir, ROUTES_FILE, { routes })
}

export function loadCachedProjects(dataDir: string): Promise<ProjectConfig[]> {
  return readCache<ProjectConfig>(dataDir, PROJECTS_FILE, 'projects')
}

export function saveCachedProjects(dataDir: string, projects: ProjectConfig[]): Promise<void> {
  return writeCache(dataDir, PROJECTS_FILE, { projects })
}
