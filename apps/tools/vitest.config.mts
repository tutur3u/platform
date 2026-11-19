import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      // node:test profile and startup checks. The native job runs them
      // with node --test before vitest.
      'cloudflare/**',
    ],
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/supabase\/(.+)$/,
        replacement: resolve(__dirname, '../../packages/supabase/src/$1.ts'),
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
