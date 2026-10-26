import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/types\/(.+)$/,
        replacement: path.resolve(import.meta.dirname, '../types/src/$1.ts'),
      },
    ],
  },
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  oxc: false,
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
  },
});
