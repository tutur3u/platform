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
    environment: 'node',
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
    ],
  },
});
