import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['bun', 'module', 'browser', 'development|production'],
    alias: {
      '@': new URL('../src', import.meta.url).pathname,
      '@tuturuuu/start-bridge/api-forward': new URL(
        '../../../packages/start-bridge/src/core/api-forward.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['apps/web/cloudflare/**/*.test.{ts,tsx}'],
    maxWorkers: 1,
  },
});
