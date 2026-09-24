import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  oxc: false,
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
