import { defineConfig } from 'vite-plus';

// The real Worker/DO regression suite uses node:test and the cf Vite runtime
// through `test`. Keep root Vitest discovery from collecting that suite.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], pool: 'threads' },
});
