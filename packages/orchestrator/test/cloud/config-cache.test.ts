import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { TICKET_PROVIDER, type ProjectConfig } from '@sentinel0/common'
import {
  loadCachedProjects,
  loadCachedRoutes,
  saveCachedProjects,
  saveCachedRoutes,
} from '../../src/cloud/config-cache.js'

let dataDir = ''

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel0-cache-'))
})

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

const project: ProjectConfig = {
  id: 'taplands',
  provider: TICKET_PROVIDER.LINEAR,
  filters: { team: 'ENG' },
}

describe('project cache', () => {
  it('is empty before anything is written, rather than throwing', async () => {
    await expect(loadCachedProjects(dataDir)).resolves.toEqual([])
  })

  it('round-trips', async () => {
    await saveCachedProjects(dataDir, [project])
    await expect(loadCachedProjects(dataDir)).resolves.toEqual([project])
  })

  it('accepts a bare array, so the file can be hand-written with no cloud', async () => {
    await fs.writeFile(path.join(dataDir, 'projects.json'), JSON.stringify([project]))
    await expect(loadCachedProjects(dataDir)).resolves.toEqual([project])
  })

  it('rejects a file whose payload is not a list', async () => {
    await fs.writeFile(path.join(dataDir, 'projects.json'), JSON.stringify({ projects: 'nope' }))
    await expect(loadCachedProjects(dataDir)).rejects.toThrow(/expected an array of projects/)
  })
})

describe('route cache', () => {
  it('is empty before anything is written', async () => {
    await expect(loadCachedRoutes(dataDir)).resolves.toEqual([])
  })

  it('round-trips and keeps the two caches independent', async () => {
    await saveCachedRoutes(dataDir, [{ id: 'rt_1' } as never])
    await saveCachedProjects(dataDir, [project])

    expect(await loadCachedRoutes(dataDir)).toHaveLength(1)
    expect(await loadCachedProjects(dataDir)).toEqual([project])
  })

  it('writes atomically, leaving no temp file behind', async () => {
    await saveCachedRoutes(dataDir, [])
    const entries = await fs.readdir(dataDir)
    expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
