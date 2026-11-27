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
    passWithNoTests: true,
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(import.meta.dirname, 'src') },
      {
        find: /^#secret-env$/u,
        replacement: resolve(
          import.meta.dirname,
          '../../packages/supabase/src/next/secret-env.ts'
        ),
      },
      {
        find: /^@tuturuuu\/supabase\/next\/(.+)$/u,
        replacement: resolve(
          import.meta.dirname,
          '../../packages/supabase/src/next/$1.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api$/u,
        replacement: resolve(
          import.meta.dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/workspace-config-ids$/u,
        replacement: resolve(
          import.meta.dirname,
          '../../packages/internal-api/src/workspace-config-ids.ts'
        ),
      },
    ],
  },
});
