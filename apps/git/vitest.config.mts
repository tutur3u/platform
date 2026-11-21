import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@tuturuuu/supabase/next': new URL(
        '../../packages/supabase/src/next',
        import.meta.url
      ).pathname,
      '#secret-env': new URL(
        '../../packages/supabase/src/next/secret-env.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: {
    environment: 'node',
    // node:test profile check, run by the `test` script with node --test.
    exclude: [...configDefaults.exclude, 'cloudflare/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
