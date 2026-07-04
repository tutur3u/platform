/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@tuturuuu/types',
        replacement: resolve(__dirname, '../types/src/index.ts'),
      },
      {
        find: /^@tuturuuu\/types\/(.+)$/,
        replacement: `${resolve(__dirname, '../types/src')}/$1.ts`,
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${resolve(__dirname, '../internal-api/src')}/$1.ts`,
      },
      {
        find: '@tuturuuu/devbox',
        replacement: resolve(__dirname, '../devbox/src/index.ts'),
      },
      {
        find: /^@tuturuuu\/utils\/(.+)$/,
        replacement: `${resolve(__dirname, '../utils/src')}/$1.ts`,
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
