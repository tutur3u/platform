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
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
      {
        find: '@tuturuuu/internal-api/workspace-config-ids',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/workspace-config-ids.ts'
        ),
      },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../../packages/internal-api/src'),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/supabase/next',
        replacement: resolve(__dirname, '../../packages/supabase/src/next'),
      },
      {
        find: '@tuturuuu/supabase/request/server',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/request/server.ts'
        ),
      },
      {
        find: '#secret-env',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/secret-env.ts'
        ),
      },
    ],
  },
});
