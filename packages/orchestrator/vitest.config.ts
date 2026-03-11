import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@parallax/common': path.resolve(__dirname, '../common/src/index.ts'),
      '@parallax/common/executor': path.resolve(__dirname, '../common/src/executor.ts'),
    },
  },
  test: {
    exclude: ['workspaces/**', 'worktrees/**', 'node_modules/**', 'dist/**'],
  },
})
