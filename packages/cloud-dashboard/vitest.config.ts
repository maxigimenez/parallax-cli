import { defineConfig } from 'vitest/config'

/**
 * Separate from vite.config.ts because the app config declares a dev-server
 * plugin vitest has no server to attach to, and mixing the two makes a type
 * error out of a config key neither tool fully owns.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
