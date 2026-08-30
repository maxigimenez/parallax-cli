import fs from 'node:fs/promises'
import path from 'node:path'
import type { RoutingRule } from '@parallax/common'

const ROUTES_FILE = 'routes.json'

export function routeCachePath(dataDir: string): string {
  return path.join(dataDir, ROUTES_FILE)
}

/**
 * Last known good routes.
 *
 * Doubles as the offline configuration surface: with no cloud configured, this
 * file IS the route table, which is what makes the trigger engine testable on a
 * machine before any control plane exists.
 */
export async function loadCachedRoutes(dataDir: string): Promise<RoutingRule[]> {
  let raw: string
  try {
    raw = await fs.readFile(routeCachePath(dataDir), 'utf8')
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const parsed = JSON.parse(raw) as unknown
  const routes = Array.isArray(parsed) ? parsed : ((parsed as { routes?: unknown }).routes ?? [])

  if (!Array.isArray(routes)) {
    throw new Error(`Invalid routes file at ${routeCachePath(dataDir)}: expected an array.`)
  }
  return routes as RoutingRule[]
}

export async function saveCachedRoutes(dataDir: string, routes: RoutingRule[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const target = routeCachePath(dataDir)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ routes }, null, 2))
  await fs.rename(tmp, target)
}
