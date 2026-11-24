import { defineConfig } from 'vite-plus';

// Unit tests run the stores and handlers over node:sqlite without a Workers
// runtime; nothing here starts the Vite plugin.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
