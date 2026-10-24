import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  tsconfig: join(root, 'tsconfig.typecheck.json'),
  test: {
    setupFiles: ['./tests/setup-state-root.ts'],
    pool: 'threads',
    maxWorkers: 2,
    minWorkers: 1,
  },
});
