import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    // Pinned explicitly: source has no fallback, and root-cutover.test.ts
    // re-imports the config under each profile plus the unset/unknown cases.
    env: { CALENDAR_DEPLOYMENT_PROFILE: 'production' },
  },
  ssr: {
    resolve: {
      conditions: ['bun', 'node', 'development|production'],
    },
  },
  resolve: {
    conditions: ['bun', 'node', 'development|production'],
    alias: [
      {
        find: /^server-only$/u,
        replacement: fileURLToPath(
          import.meta.resolve('@tanstack/react-start/server-only')
        ),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/$1.ts'
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
        find: '@tuturuuu/supabase/next/client',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/client.ts'
        ),
      },
      {
        find: /^@tuturuuu\/types\/(.*)$/,
        replacement: resolve(__dirname, '../../packages/types/src/$1'),
      },
    ],
  },
});
