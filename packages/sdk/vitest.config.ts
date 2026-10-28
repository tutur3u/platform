/// <reference types="vitest" />
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@tuturuuu/devbox/actor',
        replacement: resolve(__dirname, '../devbox/src/actor.ts'),
      },
      {
        find: /^@\/(.+)$/,
        replacement: `${resolve(__dirname, '../../apps/web/src')}/$1`,
      },
      {
        find: /^@tuturuuu\/types$/,
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
        find: /^@tuturuuu\/devbox$/,
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
    // No test (or CLI child it spawns) may run a real automatic reclaim or
    // write this machine's storage pressure state, lease or receipts, and
    // fixtures that launch real heavy commands must not depend on this
    // machine's free disk; admission tests pass explicit env objects.
    env: {
      TTR_STORAGE_AUTO_RECLAIM: '0',
      TTR_STORAGE_HOME: resolve(tmpdir(), 'ttr-sdk-test-storage'),
      TTR_RESOURCES_IGNORE_DISK: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
