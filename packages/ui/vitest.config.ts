import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    silent,
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api/tasks',
        replacement: resolve(__dirname, '../internal-api/src/tasks.ts'),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${resolve(__dirname, '../internal-api/src')}/$1.ts`,
      },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../internal-api/src/index.ts'),
      },
      {
        find: '@tuturuuu/supabase/next/client',
        replacement: resolve(__dirname, '../supabase/src/next/client.ts'),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(__dirname, '../supabase/src/next/server.ts'),
      },
    ],
  },
});
