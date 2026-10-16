import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/web/e2e/fixtures/employee-web-session-{support,readiness,config}.test.ts',
    ],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10000,
  },
});
