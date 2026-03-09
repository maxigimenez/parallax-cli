import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const marketingRoot = path.resolve(__dirname, '..')
const docsSourceDir = path.resolve(marketingRoot, '..', '..', 'docs')
const docsTargetDir = path.join(marketingRoot, 'public', 'docs')

const DOC_FILES = [
  'README.md',
  'getting-started.md',
  'configuration.md',
  'cli-reference.md',
  'task-lifecycle.md',
  'troubleshooting.md',
]

async function main() {
  await fs.mkdir(docsTargetDir, { recursive: true })

  const existingEntries = await fs.readdir(docsTargetDir)
  await Promise.all(
    existingEntries
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => fs.rm(path.join(docsTargetDir, entry), { force: true }))
  )

  await Promise.all(
    DOC_FILES.map(async (fileName) => {
      const sourcePath = path.join(docsSourceDir, fileName)
      const targetPath = path.join(docsTargetDir, fileName)
      await fs.copyFile(sourcePath, targetPath)
    })
  )
}

await main()
