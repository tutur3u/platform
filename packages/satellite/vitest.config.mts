import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    silent,
  },
  resolve: {
    // Server helpers expose built CommonJS entries to Node. Resolve their source
    // so Vitest can apply server-only and client mocks without building locally.
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: resolve(
          import.meta.dirname,
          '../internal-api/src/index.ts'
        ),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(
          import.meta.dirname,
          '../supabase/src/next/server.ts'
        ),
      },
    ],
  },
});
