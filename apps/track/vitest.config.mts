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
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(
          __dirname,
          '../../packages/supabase/src/next/server.ts'
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
        find: /^@tuturuuu\/types\/primitives\/(.+)$/,
        replacement: resolve(
          __dirname,
          '../../packages/types/src/primitives/$1.ts'
        ),
      },
      {
        find: /^@tuturuuu\/supabase\/(.+)$/,
        replacement: resolve(__dirname, '../../packages/supabase/src/$1.ts'),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
    ],
  },
});
