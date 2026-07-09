import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  oxc: false,
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: 'server-only',
        replacement: resolve(__dirname, './src/test/server-only-stub.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
});
