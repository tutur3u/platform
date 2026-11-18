import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const meetSrc = fileURLToPath(
  new URL('../../../../apps/meet/src/', import.meta.url)
);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  define: { 'process.env': {} },
  resolve: {
    alias: [
      { find: /^@\//u, replacement: meetSrc },
      {
        find: /^@tuturuuu\/internal-api$/u,
        replacement: fileURLToPath(
          new URL('../../../internal-api/src/index.ts', import.meta.url)
        ),
      },
    ],
  },
  plugins: [react()],
  css: { postcss: { plugins: [tailwind()] } },
  server: {
    host: '127.0.0.1',
    port: 5211,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
