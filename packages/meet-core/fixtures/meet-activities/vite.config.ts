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
  // internal-api ships CommonJS; pre-bundle it so named imports resolve in the browser.
  optimizeDeps: {
    include: [
      '@tuturuuu/internal-api',
      '@tuturuuu/internal-api/client',
      '@tuturuuu/internal-api/meet-call',
      '@tuturuuu/internal-api/meet-whiteboard',
      '@tuturuuu/internal-api/upskii-content',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5213,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
