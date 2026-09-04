import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@sentinel0/common': path.resolve(__dirname, '../common/src/index.ts'),
      '@sentinel0/common/executor': path.resolve(__dirname, '../common/src/executor.ts'),
    },
  },
})
