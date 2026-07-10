import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api\/(.*)$/,
        replacement: resolve(__dirname, '../internal-api/src/$1.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
