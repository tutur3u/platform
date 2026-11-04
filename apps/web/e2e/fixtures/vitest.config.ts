import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web-e2e-fixtures',
    root: import.meta.dirname,
    environment: 'node',
    include: ['employee-*.test.ts'],
    testTimeout: 30_000,
  },
});
