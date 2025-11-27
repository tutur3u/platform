import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: loadEnv('test', process.cwd(), ''),
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
