import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { landingCriticalCss } from './scripts/landing-critical-css.mjs';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    landingCriticalCss(fileURLToPath(new URL('.', import.meta.url))),
  ],
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
    globals: true,
    testTimeout: 15000,
  },
});
