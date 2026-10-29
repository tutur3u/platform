import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api/workspace-config-ids',
        replacement: resolve(
          __dirname,
          '../internal-api/src/workspace-config-ids.ts'
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
