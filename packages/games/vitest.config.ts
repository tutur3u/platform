import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    env: loadEnv('production', process.cwd(), ''),
  },
  keepProcessEnv: true,
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
