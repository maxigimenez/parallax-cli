import { generateKey, newId, type KeyScope } from './auth.js'
import { closePool, getPool, migrate, type Database } from './db.js'

/**
 * One-off bootstrap: creates an organization and its first API keys.
 *
 * This exists because the key-minting endpoint needs a user key to call, and the
 * first one has to come from somewhere. Run it inside the deployed container
 * (`railway ssh`), or locally against the database's public URL. It is the only
 * path that can create credentials without already holding one.
 */

interface Args {
  name?: string
  addKey?: KeyScope
  org?: string
  list?: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--name':
        args.name = requireValue(flag, value)
        i += 1
        break
      case '--org':
        args.org = requireValue(flag, value)
        i += 1
        break
      case '--add-key':
        if (value !== 'runner' && value !== 'user') {
          throw new Error('--add-key must be "runner" or "user".')
        }
        args.addKey = value
        i += 1
        break
      case '--list':
        args.list = true
        break
      default:
        throw new Error(`Unknown argument "${flag}".`)
    }
  }
  return args
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

async function mintKey(
  db: Database,
  orgId: string,
  scope: KeyScope,
  name: string
): Promise<string> {
  const { key, hash, prefix } = generateKey(scope)
  await db.query(
    'INSERT INTO api_keys (id, org_id, name, scope, key_hash, prefix) VALUES ($1,$2,$3,$4,$5,$6)',
    [newId('key'), orgId, name, scope, hash, prefix]
  )
  return key
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.name && !args.list && !args.addKey) {
    console.log(
      [
        '',
        'Usage:',
        '  node dist/org-cli.js --name "Acme"        create an org plus its first user and runner keys',
        '  node dist/org-cli.js --list               list organizations',
        '  node dist/org-cli.js --org <id> --add-key runner|user',
        '',
        'Requires DATABASE_URL.',
        '',
      ].join('\n')
    )
    return
  }

  const db = getPool()
  await migrate(db)

  if (args.list) {
    const { rows } = await db.query('SELECT id, name, created_at FROM organizations ORDER BY name')
    if (rows.length === 0) {
      console.log('No organizations yet. Create one with --name "Your Org".')
      return
    }
    for (const row of rows) {
      console.log(`${row.id}  ${row.name}`)
    }
    return
  }

  if (args.addKey) {
    if (!args.org) {
      throw new Error('--add-key requires --org <orgId>. List them with --list.')
    }
    const { rowCount } = await db.query('SELECT 1 FROM organizations WHERE id = $1', [args.org])
    if (rowCount === 0) {
      throw new Error(`Organization "${args.org}" not found.`)
    }
    const key = await mintKey(db, args.org, args.addKey, `${args.addKey} key`)
    console.log(`\n  ${args.addKey} key: ${key}\n`)
    console.log('Store it now; it is not recoverable.\n')
    return
  }

  const orgId = newId('org')
  await db.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [orgId, args.name])

  const userKey = await mintKey(db, orgId, 'user', 'bootstrap user key')
  const runnerKey = await mintKey(db, orgId, 'runner', 'bootstrap runner key')

  console.log(
    [
      '',
      `Organization created: ${args.name}`,
      `  id:         ${orgId}`,
      '',
      '  user key:   ' + userKey,
      '    Use for the management API (routes, projects, Slack, runs).',
      '',
      '  runner key: ' + runnerKey,
      '    Give this to the runner on cerebro during "sentinel0 init".',
      '',
      'Neither key is recoverable. Store them now.',
      '',
    ].join('\n')
  )
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error)
    await closePool()
    process.exit(1)
  })
