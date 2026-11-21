import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tuturuuu/supabase/next': fileURLToPath(
        new URL('../../packages/supabase/src/next', import.meta.url)
      ),
      '#secret-env': fileURLToPath(
        new URL(
          '../../packages/supabase/src/next/secret-env.ts',
          import.meta.url
        )
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      // node:test profile check; `bun run test` runs it with node --test.
      'cloudflare/**',
    ],
    globals: true,
  },
});
