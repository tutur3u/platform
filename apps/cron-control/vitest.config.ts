import { defineConfig } from 'vite-plus';

// Unit tests must not start the Vite Worker development plugin or scheduled work.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads', maxWorkers: 2 },
});
