import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/.next/**', '**/e2e/**', '**/node_modules/**'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    testTimeout: 30_000,
  },
});
