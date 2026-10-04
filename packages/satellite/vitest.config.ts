import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/supabase\/next\/server$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../supabase/src/next/server.ts'
        ),
      },
      // Match the default config selected by `vitest run` in fresh CI.
      // Source loading lets Vitest apply the test's server-only partial mock.
      {
        find: /^@tuturuuu\/storage-core\/profile-upload-budget$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../storage-core/src/lib/profile-upload-budget.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/$1.ts'
        ),
      },
    ],
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    testTimeout: 15000,
  },
});
