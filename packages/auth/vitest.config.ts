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
      // Shared MFA runtime reads Supabase auth cookie names from source.
      '@tuturuuu/supabase/next/common': new URL(
        '../supabase/src/next/common.ts',
        import.meta.url
      ).pathname,
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
