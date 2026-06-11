import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
