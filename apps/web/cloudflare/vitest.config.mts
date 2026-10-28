import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['bun', 'module', 'browser', 'development|production'],
    alias: {
      '@tuturuuu/start-bridge/api-forward': new URL(
        '../../../packages/start-bridge/src/core/api-forward.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['apps/web/cloudflare/**/*.test.ts'],
    maxWorkers: 1,
  },
});
