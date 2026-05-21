import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@parallax/common': path.resolve(__dirname, '../common/src/index.ts'),
    },
  },
  test: {
    exclude: ['node_modules/**', 'dist/**'],
  },
})
