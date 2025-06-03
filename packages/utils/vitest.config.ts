import react from '@vitejs/plugin-react';
import { resolve } from 'path';
<<<<<<<< HEAD:packages/utils/vitest.config.ts
import { loadEnv } from 'vite';
========
>>>>>>>> upstream/main:apps/rewise/vitest.config.mts
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
