import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/internal-api/src/$1.ts'
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
