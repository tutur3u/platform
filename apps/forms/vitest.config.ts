import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, '**/cloudflare/**'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // The form studio and runtime suites drive a lot of UI; the 5s default
    // flakes when turbo runs suites concurrently.
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
      {
        find: '@tuturuuu/supabase/next',
        replacement: new URL(
          '../../packages/supabase/src/next',
          import.meta.url
        ).pathname,
      },
      {
        find: '#secret-env',
        replacement: new URL(
          '../../packages/supabase/src/next/secret-env.ts',
          import.meta.url
        ).pathname,
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      // Resolve the mocked server boundary without building shared packages.
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/server.ts'
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
