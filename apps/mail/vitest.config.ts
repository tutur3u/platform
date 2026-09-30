import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${resolve(__dirname, '../../packages/internal-api/src')}/$1`,
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@tuturuuu/internal-api',
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    include: ['src/**/*.test.ts'],
    silent,
  },
});
