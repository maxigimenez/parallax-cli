import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliDir = path.resolve(__dirname, '..')
const backupPath = path.join(cliDir, '.pack-backup.json')

function targetDirForPackage(packageName) {
  return path.join(cliDir, 'node_modules', ...packageName.split('/'))
}

async function restoreTarget(packageName, backup) {
  const targetDir = targetDirForPackage(packageName)
  await fs.rm(targetDir, { recursive: true, force: true })

  if (backup.kind === 'symlink') {
    await fs.mkdir(path.dirname(targetDir), { recursive: true })
    await fs.symlink(backup.target, targetDir)
  }
}

async function main() {
  try {
    const raw = await fs.readFile(backupPath, 'utf8')
    const backup = JSON.parse(raw)

    for (const [packageName, targetBackup] of Object.entries(backup)) {
      await restoreTarget(packageName, targetBackup)
    }
  } finally {
    await fs.rm(backupPath, { force: true })
  }
}

await main()
