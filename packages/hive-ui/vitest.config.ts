import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    hookTimeout: 15_000,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15_000,
  },
});
