import { defineConfig } from 'vite-plus';

// Unit tests must not start the Cloudflare Vite development plugin.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads', maxWorkers: 2 },
});
