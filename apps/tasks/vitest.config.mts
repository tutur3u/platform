import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api/workspace-config-ids',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/workspace-config-ids.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/workspace-configs',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/workspace-configs.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/auth-session-user',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/auth-session-user.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/server.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/user',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/user.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/types',
        replacement: resolve(__dirname, '../../packages/supabase/src/types.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/.next/**', '**/e2e/**', '**/node_modules/**'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    testTimeout: 30_000,
  },
});
