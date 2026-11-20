import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../../packages/internal-api/src'),
      },
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
    ],
  },
});
