import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['workspaces/**', 'worktrees/**', 'node_modules/**', 'dist/**'],
  },
})
