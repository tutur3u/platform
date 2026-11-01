import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'drive-rsc-test-adapter',
      enforce: 'pre',
      transform(source, id) {
        if (id.endsWith('/cloudflare/worker.ts')) {
          return source.replaceAll(
            'import.meta.viteRsc',
            'globalThis.__driveTestRsc'
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
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/supabase/next/common',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/common.ts'
        ),
      },
    ],
  },
});
