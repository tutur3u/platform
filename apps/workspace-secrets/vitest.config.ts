import { defineConfig } from 'vite-plus';

// Unit tests run the service over injected database and key fakes with
// throwaway keys; they never start the Vite plugin or reach a network.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
