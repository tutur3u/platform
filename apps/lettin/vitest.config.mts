import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tuturuuu/internal-api/lettin': fileURLToPath(
        new URL('../../packages/internal-api/src/lettin.ts', import.meta.url)
      ),
    },
  },
  test: { exclude: ['**/.next/**', '**/node_modules/**'] },
});
