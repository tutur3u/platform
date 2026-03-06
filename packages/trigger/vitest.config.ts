import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  test: {
    environment: 'node',
    env: loadEnv('test', process.cwd(), ''),
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    silent,
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
