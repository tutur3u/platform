import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    // `@tuturuuu/types` only exposes built `dist/**` entrypoints, and the turbo
    // `test` task does not depend on `^build`, so resolve value imports (e.g.
    // EMPTY_FOLDER_PLACEHOLDER_NAME) straight from source instead.
    alias: [
      {
        find: /^@tuturuuu\/types\/primitives\/(.+)$/,
        replacement: `${resolve(__dirname, '../types/src/primitives')}/$1.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent,
  },
});
