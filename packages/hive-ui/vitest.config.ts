import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(__dirname, '../internal-api/src/index.ts'),
      },
      {
        find: 'next/navigation',
        replacement: resolve(
          __dirname,
          '../start-bridge/src/next/navigation.tsx'
        ),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    pool: 'threads',
    exclude: ['**/dist/**', '**/node_modules/**'],
    hookTimeout: 15_000,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15_000,
  },
});
