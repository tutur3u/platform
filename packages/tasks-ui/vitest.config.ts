import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@tuturuuu/tasks-api/progress/preferences',
        replacement: resolve(
          __dirname,
          '../tasks-api/src/progress/preferences.ts'
        ),
      },
      {
        find: /^@tuturuuu\/tasks-api$/,
        replacement: resolve(__dirname, '../tasks-api/src/progress/client.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
