import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  oxc: false,
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      // Test current workspace source without requiring package builds.
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../../packages/internal-api/src'),
      },
      {
        find: '@tuturuuu/supabase/next',
        replacement: resolve(__dirname, '../../packages/supabase/src/next'),
      },
      {
        find: 'server-only',
        replacement: resolve(__dirname, './src/test/server-only-stub.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
});
