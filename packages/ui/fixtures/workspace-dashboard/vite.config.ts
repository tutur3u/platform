import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Standalone workspace dashboard fixture: the shared layout and production
 * cards with synthetic in-memory data (fixture-api.ts). No auth, database or
 * live network; server-only modules are refused at resolve time.
 */
const SERVER_ONLY = [
  /^next\/headers$/,
  /^next\/server$/,
  /^@tuturuuu\/supabase\/next\/server/,
  /^@tuturuuu\/utils\/workspace-helper$/,
  /^@tuturuuu\/utils\/user-helper$/,
  /^server-only$/,
];

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  define: { 'process.env': {} },
  plugins: [
    react(),
    {
      name: 'workspace-dashboard-fixture-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (SERVER_ONLY.some((pattern) => pattern.test(source))) {
          throw new Error(
            `Fixture import boundary: ${source} (from ${importer ?? 'entry'}) is server-only`
          );
        }
        return null;
      },
    },
  ],
  resolve: {
    // Same source mapping as packages/ui/vitest.config.ts: no package build.
    alias: [
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${fileURLToPath(new URL('../../../internal-api/src', import.meta.url))}/$1.ts`,
      },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: fileURLToPath(
          new URL('../../../internal-api/src/index.ts', import.meta.url)
        ),
      },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  server: {
    host: '127.0.0.1',
    port: 5201,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
