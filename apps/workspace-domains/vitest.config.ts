import { defineConfig } from 'vitest/config';

// Unit tests drive the handler with an in-memory Cache API double and a
// stubbed fetch; no Worker runtime is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
    maxWorkers: 2,
  },
});
