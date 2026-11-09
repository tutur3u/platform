import { defineConfig } from 'vite-plus';

// Unit tests drive the handler with an in-memory Cache API double.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads', maxWorkers: 2 },
});
