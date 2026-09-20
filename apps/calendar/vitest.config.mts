import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        // Transform shared server modules so server-only mocks also apply
        // with Bun's isolated CI dependency layout.
        inline: ['next-intl', '@tuturuuu/utils'],
      },
    },
    environment: 'jsdom',
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
  },
});
