import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tuturuuu/utils/api-proxy-guard': fileURLToPath(
        new URL('../../packages/utils/src/api-proxy-guard.ts', import.meta.url)
      ),
    },
  },
});
