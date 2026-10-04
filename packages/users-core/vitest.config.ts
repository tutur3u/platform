import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/storage-core\/profile-upload-budget$/,
        replacement: resolve(
          __dirname,
          '../storage-core/src/lib/profile-upload-budget.ts'
        ),
      },
      {
        find: /^@tuturuuu\/supabase\/next\/auth-session-user$/,
        replacement: resolve(
          __dirname,
          '../supabase/src/next/auth-session-user.ts'
        ),
      },
      {
        find: /^@tuturuuu\/supabase\/next\/server$/,
        replacement: resolve(__dirname, '../supabase/src/next/server.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
