/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: [
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
        find: /^@tuturuuu\/types\/primitives\/(.+)$/,
        replacement: `${resolve(__dirname, '../types/src/primitives')}/$1.ts`,
      },
      {
        find: '@tuturuuu/supabase/next/auth-session-user',
        replacement: resolve(
          __dirname,
          '../supabase/src/next/auth-session-user.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(__dirname, '../supabase/src/next/server.ts'),
      },
      {
        find: '@tuturuuu/supabase/next/user',
        replacement: resolve(__dirname, '../supabase/src/next/user.ts'),
      },
      {
        find: '@tuturuuu/supabase/types',
        replacement: resolve(__dirname, '../supabase/src/types.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    silent,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
