import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/$1.ts'
        ),
      },
    ],
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    testTimeout: 15000,
  },
});
