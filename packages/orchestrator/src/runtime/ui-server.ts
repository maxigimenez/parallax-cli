import Fastify from 'fastify'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function inferMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  return STATIC_MIME[extension] || 'application/octet-stream'
}

function injectUiRuntimeConfig(html: string, apiPort: number): string {
  const runtimeScript = `<script>window.__PARALLAX_RUNTIME_CONFIG__=${JSON.stringify({ apiBase: `http://localhost:${apiPort}` })}</script>`
  return html.includes('</head>')
    ? html.replace('</head>', `  ${runtimeScript}\n</head>`)
    : `${runtimeScript}\n${html}`
}

export function resolveUiDistPath(): string | undefined {
  const currentFilePath = fileURLToPath(import.meta.url)
  const orchestratorDistDir = path.dirname(currentFilePath)
  const require = createRequire(import.meta.url)
  let bundledUiDist: string | undefined
  try {
    bundledUiDist = path.dirname(require.resolve('@parallax/ui/dist/index.html'))
  } catch {
    bundledUiDist = undefined
  }

  const workspaceUiDist = path.resolve(process.cwd(), '../ui/dist')
  const envUiDist = process.env.PARALLAX_UI_DIST
    ? path.resolve(process.env.PARALLAX_UI_DIST)
    : undefined
  const legacyBundledUiDist = path.resolve(orchestratorDistDir, '../../ui/dist')

  return [envUiDist, bundledUiDist, legacyBundledUiDist, workspaceUiDist]
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate as string)) as string | undefined
}

export async function startUiServer(uiDistPath: string, uiPort: number, apiPort: number) {
  const uiFastify = Fastify({ logger: false })

  uiFastify.get('/*', async (request, reply) => {
    const requestPath = (request.params as { '*': string })['*'] || ''
    const normalized = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath
    const decoded = decodeURIComponent(normalized)
    const resolved = path.resolve(uiDistPath, decoded || 'index.html')
    const uiRootResolved = path.resolve(uiDistPath)

    if (!resolved.startsWith(uiRootResolved)) {
      return reply.status(400).send({ error: 'Invalid path' })
    }

    const candidatePath =
      fs.existsSync(resolved) && fs.statSync(resolved).isFile()
        ? resolved
        : path.resolve(uiDistPath, 'index.html')

    try {
      const content = await fsPromises.readFile(candidatePath, 'utf8')
      if (path.basename(candidatePath) === 'index.html') {
        return reply.type('text/html; charset=utf-8').send(injectUiRuntimeConfig(content, apiPort))
      }

      return reply.type(inferMimeType(candidatePath)).send(content)
    } catch {
      return reply.status(404).send({ error: 'UI asset not found' })
    }
  })

  await uiFastify.listen({ port: uiPort, host: '0.0.0.0' })
  return uiFastify
}
