import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const utilsRequire = createRequire(
  resolve(__dirname, '../../packages/utils/package.json')
);

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        // https://github.com/vercel/next.js/issues/77200
        inline: ['next-intl'],
      },
    },
    exclude: ['**/.next/**', '**/e2e/**', '**/node_modules/**'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    env: {
      ...loadEnv('production', process.cwd(), ''),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    },
  },
  resolve: {
    alias: [
      {
        find: '@tuturuuu/supabase/next/user',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/user.ts'
        ),
      },
      // Match guard imports and test mocks under Bun's isolated linker.
      {
        find: '@upstash/ratelimit',
        replacement: utilsRequire.resolve('@upstash/ratelimit'),
      },
      {
        find: '@upstash/redis',
        replacement: utilsRequire.resolve('@upstash/redis'),
      },
      {
        find: '@tuturuuu/supabase/next/common',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/common.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/auth-errors',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/auth-errors.ts'
        ),
      },
      {
        find: '@tuturuuu/devbox/balancer',
        replacement: resolve(
          __dirname,
          '../../packages/devbox/src/balancer/index.ts'
        ),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/$1.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/realtime-log-provider',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/realtime-log-provider.tsx'
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
    ],
  },
});
