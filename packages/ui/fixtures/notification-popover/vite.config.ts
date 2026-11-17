import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const internalApiSrc = fileURLToPath(
  new URL('../../../internal-api/src/', import.meta.url)
);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  define: { 'process.env': {} },
  plugins: [react()],
  css: { postcss: { plugins: [tailwind()] } },
  // Source, not the built package, so the fixture runs without a build step.
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: `${internalApiSrc}index.ts`,
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${internalApiSrc}$1.ts`,
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5198,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
