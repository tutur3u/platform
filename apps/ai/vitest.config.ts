import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tuturuuu/internal-api': path.resolve(
        __dirname,
        '../../packages/internal-api/src'
      ),
      '@tuturuuu/supabase/next': path.resolve(
        __dirname,
        '../../packages/supabase/src/next'
      ),
      '#secret-env': path.resolve(
        __dirname,
        '../../packages/supabase/src/next/secret-env.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
