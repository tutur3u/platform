import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['cloudflare/**/*.test.ts'],
    exclude: configDefaults.exclude,
  },
});
