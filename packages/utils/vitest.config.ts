import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    env: loadEnv('production', process.cwd(), ''),
    exclude: ['**/node_modules/**', '**/dist/**'],
    silent,
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/types/primitives/playgrounds',
        replacement: resolve(
          __dirname,
          '../types/src/primitives/playgrounds.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/tasks',
        replacement: resolve(__dirname, '../internal-api/src/tasks.ts'),
      },
      {
        find: '@tuturuuu/internal-api/workspace-configs',
        replacement: resolve(
          __dirname,
          '../internal-api/src/workspace-configs.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(__dirname, '../supabase/src/next/server.ts'),
      },
    ],
  },
});
