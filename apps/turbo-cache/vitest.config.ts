import { defineConfig } from 'vite-plus';

// Unit tests use in-memory R2/Durable Object doubles; they must not start the
// Vite Worker development plugin.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads', maxWorkers: 2 },
});
