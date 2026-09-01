import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The API URL is resolved at runtime, not baked in at build time.
 *
 * A `VITE_` variable would be inlined by the bundler, which would mean
 * rebuilding and redeploying the image every time the control plane moves.
 * Instead the page loads `/env.js`, which `server.mjs` generates per request
 * from `PARALLAX_API_URL`; this plugin serves the same file in dev, so both
 * environments resolve the URL through exactly one code path.
 *
 * The tag is injected here rather than written into index.html because Vite
 * scans that file for scripts to bundle and `/env.js` has no build-time
 * existence to bundle. Injecting it after the scan keeps the build quiet and
 * still puts the tag first, so `window.__PARALLAX__` is set before the app
 * module runs.
 */
function envScript(): Plugin {
  return {
    name: 'parallax-env-script',
    configureServer(server) {
      server.middlewares.use('/env.js', (_request, response) => {
        const apiUrl = process.env.PARALLAX_API_URL ?? 'http://127.0.0.1:8080'
        response.setHeader('Content-Type', 'application/javascript')
        response.end(`window.__PARALLAX__=${JSON.stringify({ apiUrl })}\n`)
      })
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: '/env.js' }, injectTo: 'head-prepend' }]
    },
  }
}

export default defineConfig({
  plugins: [react(), envScript()],
  server: { port: 5273 },
  build: { outDir: 'dist', sourcemap: true },
})
