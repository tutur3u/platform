import { defineConfig } from 'vite-plus';

// The real Worker/DO regression suite uses node:test and Wrangler through `test`.
// Keep root Vitest discovery from collecting that fixture as a Vitest suite.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads' },
});
