import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { discoverLocalHermes, readEnvFile, defaultHermesBaseUrl } from '../src/hermes-local.js'

let home = ''

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'))
})

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

async function writeProfile(name: string, contents: string): Promise<void> {
  const dir = path.join(home, 'profiles', name)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, '.env'), contents)
}

describe('readEnvFile', () => {
  it('parses plain assignments and strips quotes, export, and comments', async () => {
    const file = path.join(home, '.env')
    await fs.writeFile(
      file,
      [
        '# a comment',
        'API_SERVER_ENABLED=true',
        'export API_SERVER_KEY="abc123"',
        "API_SERVER_PORT='9000'  # trailing",
        'MALFORMED',
      ].join('\n')
    )

    await expect(readEnvFile(file)).resolves.toEqual({
      API_SERVER_ENABLED: 'true',
      API_SERVER_KEY: 'abc123',
      API_SERVER_PORT: '9000',
    })
  })

  it('returns nothing for a missing file rather than throwing', async () => {
    await expect(readEnvFile(path.join(home, 'nope'))).resolves.toEqual({})
  })
})

describe('discoverLocalHermes', () => {
  it('returns undefined when there is no hermes home', async () => {
    await expect(discoverLocalHermes(path.join(home, 'absent'))).resolves.toBeUndefined()
  })

  it('always includes the default profile, keyed from the root env', async () => {
    await fs.writeFile(path.join(home, '.env'), 'API_SERVER_KEY=root-key')

    const install = await discoverLocalHermes(home)

    expect(install?.profiles).toEqual([
      { name: 'default', apiKey: 'root-key', envPath: path.join(home, '.env') },
    ])
  })

  it('discovers named profiles and reads each key from its own env', async () => {
    await fs.writeFile(path.join(home, '.env'), 'API_SERVER_KEY=root')
    await writeProfile('product', 'API_SERVER_KEY=product-key')
    await writeProfile('reviewer', 'API_SERVER_KEY=reviewer-key')

    const install = await discoverLocalHermes(home)

    expect(install?.profiles.map((p) => [p.name, p.apiKey])).toEqual([
      ['default', 'root'],
      ['product', 'product-key'],
      ['reviewer', 'reviewer-key'],
    ])
  })

  it('lists a profile whose env has no key, so it can be flagged not skipped', async () => {
    await writeProfile('keyless', 'SOMETHING_ELSE=1')

    const install = await discoverLocalHermes(home)
    const keyless = install?.profiles.find((p) => p.name === 'keyless')

    expect(keyless).toBeDefined()
    expect(keyless?.apiKey).toBeUndefined()
  })

  it('sorts named profiles for a stable prompt order', async () => {
    await writeProfile('zulu', 'API_SERVER_KEY=z')
    await writeProfile('alpha', 'API_SERVER_KEY=a')

    const install = await discoverLocalHermes(home)
    expect(install?.profiles.map((p) => p.name)).toEqual(['default', 'alpha', 'zulu'])
  })

  it('ignores dotfiles and stray files under profiles/', async () => {
    await writeProfile('real', 'API_SERVER_KEY=k')
    await fs.mkdir(path.join(home, 'profiles', '.cache'), { recursive: true })
    await fs.writeFile(path.join(home, 'profiles', 'notes.txt'), 'x')

    const install = await discoverLocalHermes(home)
    expect(install?.profiles.map((p) => p.name)).toEqual(['default', 'real'])
  })

  it('reports whether the api server is switched on', async () => {
    await fs.writeFile(path.join(home, '.env'), 'API_SERVER_ENABLED=true\nAPI_SERVER_PORT=9999')
    const on = await discoverLocalHermes(home)
    expect(on?.apiServerEnabled).toBe(true)
    expect(defaultHermesBaseUrl(on)).toBe('http://127.0.0.1:9999')

    await fs.writeFile(path.join(home, '.env'), 'API_SERVER_ENABLED=false')
    const off = await discoverLocalHermes(home)
    expect(off?.apiServerEnabled).toBe(false)
    expect(defaultHermesBaseUrl(off)).toBe('http://127.0.0.1:8642')
  })
})
