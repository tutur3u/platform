import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    conditions: ['bun', 'module', 'node', 'development|production'],
  },
  ssr: {
    resolve: {
      conditions: ['bun', 'module', 'node', 'development|production'],
    },
  },
  test: {
    ...base.test,
    include: ['src/proxy.public-callback.test.ts'],
    exclude: configDefaults.exclude,
    server: { deps: { inline: ['next-intl'] } },
  },
});
