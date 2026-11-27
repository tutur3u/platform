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
      '@tuturuuu/internal-api/calendar',
      '@tuturuuu/internal-api/chat',
      '@tuturuuu/internal-api/client',
      '@tuturuuu/internal-api/meet-call',
      '@tuturuuu/internal-api/meet-whiteboard',
      '@tuturuuu/internal-api/meetings',
      '@tuturuuu/internal-api/storage',
      '@tuturuuu/internal-api/tasks',
      '@tuturuuu/internal-api/upskii-content',
      '@tuturuuu/internal-api/users',
      '@tuturuuu/internal-api/workspaces',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5213,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
