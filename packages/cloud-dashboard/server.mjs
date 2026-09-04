/**
 * Serves the built dashboard.
 *
 * Deliberately dependency-free: this is a static file server plus two dynamic
 * responses, and pulling a framework in would mean shipping its transitive tree
 * into the runtime image for no behaviour the standard library lacks.
 *
 * The two dynamic responses are the whole reason a server exists rather than a
 * CDN bucket:
 *
 *   /env.js   the API URL, read from the environment on every request, so
 *             pointing the dashboard at a different control plane is a Railway
 *             variable change rather than a rebuild.
 *   /health   an unauthenticated liveness probe for Railway's health check.
 *
 * Everything else is the SPA: a request that matches no file falls through to
 * index.html so client-side routes survive a reload or a shared link.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)))
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10)
const API_URL = process.env.SENTINEL0_API_URL ?? process.env.VITE_API_URL ?? ''

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/**
 * Resolves a URL path to a file inside dist, or undefined.
 *
 * The normalize-then-prefix-check is the traversal guard: a request for
 * `/../../etc/passwd` normalizes to a path outside ROOT and is refused rather
 * than served.
 */
async function resolveFile(urlPath) {
  const candidate = resolve(join(ROOT, normalize(decodeURIComponent(urlPath))))
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    return undefined
  }
  try {
    const info = await stat(candidate)
    return info.isFile() ? candidate : undefined
  } catch {
    return undefined
  }
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
  response.end(body)
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' })
    }

    if (url.pathname === '/health') {
      // Reports whether the dashboard is configured, but never fails on it: a
      // container that cannot serve its own pages is the outage worth
      // restarting for, and a missing API URL is fixed by editing a variable.
      return send(response, 200, JSON.stringify({ status: 'ok', apiConfigured: Boolean(API_URL) }), {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
    }

    if (url.pathname === '/env.js') {
      return send(response, 200, `window.__SENTINEL0__=${JSON.stringify({ apiUrl: API_URL })}\n`, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      })
    }

    const file = (await resolveFile(url.pathname)) ?? (await resolveFile('/index.html'))
    if (!file) {
      return send(response, 500, 'The dashboard was not built. Run "pnpm build" first.')
    }

    // Hashed asset filenames may be cached forever; index.html never may, or a
    // deploy would not reach anyone still holding the previous one.
    const immutable = file.startsWith(join(ROOT, 'assets') + sep)
    response.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (request.method === 'HEAD') {
      return response.end()
    }
    createReadStream(file).pipe(response)
  })().catch((error) => {
    console.error(error)
    if (!response.headersSent) {
      send(response, 500, 'Internal error')
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard on :${PORT} — API ${API_URL || '(unset: set SENTINEL0_API_URL)'}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
