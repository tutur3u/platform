import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      // Exercise workspace source without compiling package distributions locally.
      {
        find: '@tuturuuu/types',
        replacement: resolve(__dirname, '../../packages/types/src'),
      },
      {
        find: '@tuturuuu/supabase/next',
        replacement: resolve(__dirname, '../../packages/supabase/src/next'),
      },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../../packages/internal-api/src'),
      },
      {
        find: 'server-only',
        replacement: resolve(__dirname, './src/test/server-only-stub.ts'),
      },
    ],
  },
});
