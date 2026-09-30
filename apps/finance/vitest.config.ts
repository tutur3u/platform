import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        // Inline server helpers so vi.mock('server-only') also applies in
        // repository project/shard runs, where workspace imports are external.
        inline: [
          'next-intl',
          // Workspace symlinks resolve to source paths in CI, not package IDs.
          /[/\\]packages[/\\]inventory-core[/\\]/,
          /server-only/,
        ],
      },
    },
    // These are server-only route tests. Keep their heavy module imports from
    // competing with each other during repository-wide Turbo test runs.
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 15_000,
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './src') },
      // Node unit tests do not run with Next's react-server condition.
      // This marker replacement is test-only; runtime imports stay guarded.
      {
        find: 'server-only',
        replacement: resolve(__dirname, './vitest.server-only.ts'),
      },
    ],
  },
});
