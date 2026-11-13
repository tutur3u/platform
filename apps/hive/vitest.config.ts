import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'maintenance/**',
      // node:test profile check; the native job runs it with node --test.
      'cloudflare/**',
    ],
    // The native job exports public build fixtures such as NEXT_PUBLIC_APP_URL
    // (the production origin). Pin the app URL so redirect assertions do not
    // depend on the ambient build environment; HIVE_APP_URL wins over the
    // other candidates in lib/hive-public-url.
    env: {
      HIVE_APP_URL: 'https://hive.tuturuuu.localhost',
    },
    globals: true,
    testTimeout: 15000,
  },
});
