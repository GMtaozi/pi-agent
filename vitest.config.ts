import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: 'vmThreads',
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    env: {
      API_KEY_ENCRYPTION_KEY: 'test-encryption-key-32-chars!',
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_SECRET: 'test-refresh-secret',
      SESSION_SECRET: 'test-session-secret',
      DB_ENCRYPTION_KEY: 'test-db-encryption-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.d.ts']
    }
  }
})
