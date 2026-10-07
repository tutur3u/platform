import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // The multi-step announcement/report form tests drive a lot of UI and take
    // ~9s; the 5s default flakes when turbo runs suites concurrently. Matches
    // the timeout other app suites already use (hive 15s, tasks/infra 30s).
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/server.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/users',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/users.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/profile-media',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/profile-media.ts'
        ),
      },
      // Exercise tutoring's authored shared policy without requiring local package builds.
      {
        find: '@tuturuuu/internal-api/workspace-configs',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/workspace-configs.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/tutoring-suggestion',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/tutoring-suggestion.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/tutoring-policy',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/tutoring-policy.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api/tutoring',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/tutoring.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
    ],
  },
});
