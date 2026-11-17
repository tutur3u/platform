import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  define: { 'process.env': {} },
  plugins: [react()],
  css: { postcss: { plugins: [tailwind()] } },
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
