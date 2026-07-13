import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // The multi-step announcement/report form tests drive a lot of UI and take
    // ~9s; the 5s default flakes when turbo runs suites concurrently. Matches
    // the timeout other app suites already use (hive 15s, tasks/infra 30s).
    testTimeout: 30_000,
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
