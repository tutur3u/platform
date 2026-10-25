import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'next-intl/config': new URL(
        './src/intl/fixtures/request-config.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    silent,
  },
});
