import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@parallax/common': resolve(__dirname, '../common/src/index.ts'),
    },
  },
})
