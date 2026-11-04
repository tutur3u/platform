import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tuturuuu/supabase/auth-cookie-policy': fileURLToPath(
        new URL(
          '../../packages/supabase/src/auth-cookie-policy.ts',
          import.meta.url
        )
      ),
      '@tuturuuu/supabase/next/common': fileURLToPath(
        new URL('../../packages/supabase/src/next/common.ts', import.meta.url)
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**', 'maintenance/**'],
    globals: true,
    testTimeout: 15000,
  },
});
