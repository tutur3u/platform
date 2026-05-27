import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api\/(.*)$/,
        replacement: resolve(__dirname, '../internal-api/src/$1.ts'),
      },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../internal-api/src/index.ts'),
      },
      {
        find: /^@tuturuuu\/supabase\/(.*)$/,
        replacement: resolve(__dirname, '../supabase/src/$1.ts'),
      },
      {
        find: '@tuturuuu/supabase',
        replacement: resolve(__dirname, '../supabase/src/index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    silent,
  },
});
