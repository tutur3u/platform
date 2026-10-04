import { defineConfig } from 'vitest/config';
import config from './vitest.config';

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ['src/cli/devbox-playground-runtime.acceptance.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
