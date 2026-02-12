import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
