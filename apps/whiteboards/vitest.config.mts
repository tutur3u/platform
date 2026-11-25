import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'whiteboards-rsc-test-adapter',
      enforce: 'pre',
      transform(source, id) {
        if (id.endsWith('/cloudflare/worker.ts')) {
          return source.replaceAll(
            'import.meta.viteRsc',
            'globalThis.__whiteboardsTestRsc'
          );
        }
      },
    },
  ],
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    // cloudflare/*.test.mjs are node:test files run by `test:runtime`.
    exclude: [...configDefaults.exclude, 'cloudflare/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@tuturuuu/supabase/next',
        replacement: resolve(__dirname, '../../packages/supabase/src/next'),
      },
      {
        find: '#secret-env',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/secret-env.ts'
        ),
      },
      // The package exports point at `dist`, which tests do not build.
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
      { find: '@', replacement: resolve(__dirname, './src') },
    ],
  },
});
