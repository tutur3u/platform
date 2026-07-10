import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Keep heavy provider/mock imports from competing with each other during
    // repository-wide Turbo test runs, where CPU contention can starve the
    // event loop and make fast mocked tests exceed the default 5s timeout.
    maxWorkers: 1,
    silent,
    testTimeout: 15_000,
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
