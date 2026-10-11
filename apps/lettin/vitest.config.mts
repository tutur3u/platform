import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: {
      '@tuturuuu/editor': fileURLToPath(
        new URL('../../packages/editor/src/index.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api/lettin-server': fileURLToPath(
        new URL(
          '../../packages/internal-api/src/lettin-server.ts',
          import.meta.url
        )
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tuturuuu/supabase/next/client': fileURLToPath(
        new URL('../../packages/supabase/src/next/client.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api/lettin': fileURLToPath(
        new URL('../../packages/internal-api/src/lettin.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api/client': fileURLToPath(
        new URL('../../packages/internal-api/src/client.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api/workspaces': fileURLToPath(
        new URL(
          '../../packages/internal-api/src/workspaces.ts',
          import.meta.url
        )
      ),
      '@tuturuuu/internal-api/profile-media': fileURLToPath(
        new URL(
          '../../packages/internal-api/src/profile-media.ts',
          import.meta.url
        )
      ),
      '@tuturuuu/internal-api/users': fileURLToPath(
        new URL('../../packages/internal-api/src/users.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api/storage': fileURLToPath(
        new URL('../../packages/internal-api/src/storage.ts', import.meta.url)
      ),
      '@tuturuuu/internal-api': fileURLToPath(
        new URL('../../packages/internal-api/src/index.ts', import.meta.url)
      ),
    },
  },
  test: { exclude: ['**/.next/**', '**/node_modules/**'] },
});
