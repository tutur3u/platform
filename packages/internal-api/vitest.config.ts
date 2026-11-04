import { resolve } from 'node:path';
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    alias: {
      '@tuturuuu/supabase/auth-cookie-policy': resolve(
        __dirname,
        '../supabase/src/auth-cookie-policy.ts'
      ),
      '@tuturuuu/supabase/next/common': resolve(
        __dirname,
        '../supabase/src/next/common.ts'
      ),
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
