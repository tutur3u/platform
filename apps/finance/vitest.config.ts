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
    // These are server-only route tests. Keep their heavy module imports from
    // competing with each other during repository-wide Turbo test runs.
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 15_000,
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
