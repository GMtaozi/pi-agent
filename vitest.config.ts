import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: 'vmThreads',
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.d.ts']
    }
  }
})
