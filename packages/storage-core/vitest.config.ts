import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent,
  },
});
