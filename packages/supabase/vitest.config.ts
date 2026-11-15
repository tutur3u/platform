/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  oxc: { tsconfig: new URL('./tsconfig.json', import.meta.url).pathname },
  resolve: {
    alias: [
      // Package tests exercise the real server reader from source; the
      // browser stub is covered by secret-env-conditions.test.ts.
      {
        find: '#secret-env',
        replacement: fileURLToPath(
          new URL('./src/next/secret-env.ts', import.meta.url)
        ),
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
