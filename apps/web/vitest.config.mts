import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        // https://github.com/vercel/next.js/issues/77200
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    env: loadEnv('production', process.cwd(), ''),
  },
  keepProcessEnv: true,
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
