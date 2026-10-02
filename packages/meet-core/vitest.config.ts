import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../internal-api/src/$1.ts'
        ),
      },
    ],
  },
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  oxc: false,
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
