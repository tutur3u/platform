/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: {
      '@tuturuuu/supabase/next/user': new URL(
        '../supabase/src/next/user.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
