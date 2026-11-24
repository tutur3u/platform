import { defineConfig } from 'vite-plus';
import { PRODUCTION_DEFINES } from './src/build-defines';

// Unit tests run the stores and the sign handler over node:sqlite and
// node:crypto; the runtime test bundles the Worker and runs it in workerd
// through Miniflare. Neither starts the Vite plugin.
export default defineConfig({
  define: { ...PRODUCTION_DEFINES },
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 60_000,
  },
});
