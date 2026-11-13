import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // node:test profile check, run by the `test` script with node --test.
    exclude: [...configDefaults.exclude, 'cloudflare/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
