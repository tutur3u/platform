import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  tsconfig: fileURLToPath(new URL('./tsconfig.provider.json', import.meta.url)),
  test: {
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      'scripts/fixtures/employee-address-migration/google-preservation.test.ts',
      'scripts/fixtures/employee-address-migration/provider-cleanup.test.ts',
    ],
  },
});
