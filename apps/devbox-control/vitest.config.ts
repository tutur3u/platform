import { defineConfig } from 'vite-plus';

// Unit tests must not start the Cloudflare Vite development plugin.
export default defineConfig({
  resolve: {
    alias: {
      '@tuturuuu/devbox/actor': new URL(
        '../../packages/devbox/src/actor.ts',
        import.meta.url
      ).pathname,
    },
  },
  test: { include: ['src/**/*.test.ts'], pool: 'threads', maxWorkers: 2 },
});
