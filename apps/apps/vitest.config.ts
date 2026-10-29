import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tuturuuu/supabase/next/common': fileURLToPath(
        new URL('../../packages/supabase/src/next/common.ts', import.meta.url)
      ),
    },
    conditions: ['bun', 'module', 'node', 'development|production'],
  },
  ssr: {
    resolve: {
      alias: {
        '@tuturuuu/supabase/next/common': fileURLToPath(
          new URL('../../packages/supabase/src/next/common.ts', import.meta.url)
        ),
      },
      conditions: ['bun', 'module', 'node', 'development|production'],
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'src/native/**/*.test.{ts,tsx}',
      'src/lib/**/*.test.ts',
      'cloudflare/gateway-worker.test.ts',
    ],
    maxWorkers: 1,
  },
});
