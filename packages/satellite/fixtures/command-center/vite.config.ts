import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The fixture root holds no launcher source, so Tailwind's automatic scan
// never sees it: launcher classes reach the page only through the
// `@source` entries in packages/ui/src/globals.css, as in every consumer app.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  define: { 'process.env': {} },
  plugins: [react()],
  css: { postcss: { plugins: [tailwind()] } },
  server: {
    host: '127.0.0.1',
    port: 5198,
    strictPort: true,
    fs: { deny: ['**/.void/**', '**/.void-*', '**/.env*'] },
  },
});
