export default {
  test: {
    globals: true,
    pool: 'threads',
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    testTimeout: 30000,
    ssr: {
      noExternal: ['@workforge/*', '@earendil-works/*']
    }
  }
};
