import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tuturuuu/internal-api': path.resolve(
        __dirname,
        '../../packages/internal-api/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
