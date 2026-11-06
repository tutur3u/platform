import { defineConfig } from 'vite-plus';

// Unit tests run the engine over node:sqlite; runtime tests bundle the Worker
// and run it in workerd through Miniflare. Neither starts the Vite plugin.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
