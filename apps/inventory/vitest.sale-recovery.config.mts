import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Source-only receipt tests: no package builds, app server or database.
export default defineConfig({
  cacheDir: resolve(root, 'tmp/recovery-vite-cache'),
  resolve: {
    alias: [
      {
        find: '@tuturuuu/inventory-core/commerce/auth',
        replacement: resolve(
          root,
          'packages/inventory-core/src/lib/inventory/commerce/auth.ts'
        ),
      },
      {
        find: '@tuturuuu/inventory-core/permissions',
        replacement: resolve(
          root,
          'packages/inventory-core/src/lib/inventory/permissions.ts'
        ),
      },
      {
        find: '@tuturuuu/inventory-core/period-pricing',
        replacement: resolve(
          root,
          'packages/inventory-core/src/lib/inventory/period-pricing.ts'
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      'apps/inventory/src/app/api/v1/workspaces/**/inventory/sale-requests/**/route.test.ts',
    ],
  },
});
