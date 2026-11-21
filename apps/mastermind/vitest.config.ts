import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: [
      // Build-free tests resolve the Fleet clients from workspace source.
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${fileURLToPath(new URL('../../packages/internal-api/src', import.meta.url))}/$1.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    maxWorkers: 1,
  },
});
