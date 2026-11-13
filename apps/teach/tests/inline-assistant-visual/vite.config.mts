import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: resolve('.'),
  plugins: [
    react(),
    {
      name: 'teach-production-css-fixture',
      configureServer(server) {
        server.middlewares.use('/app.css', (_request, response) => {
          const directory = resolve('../../.next/static/chunks');
          response.setHeader('Content-Type', 'text/css');
          response.end(
            readdirSync(directory)
              .filter((file) => file.endsWith('.css'))
              .map((file) => readFileSync(`${directory}/${file}`, 'utf8'))
              .join('\n')
          );
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve('../../src'),
      '@tuturuuu/internal-api/education': resolve('./service.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  css: { postcss: { plugins: [] } },
  server: {
    host: '127.0.0.1',
    port: 7897,
    strictPort: true,
    fs: { allow: [resolve('../../../..')] },
  },
  define: {
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
      'https://fixture.invalid'
    ),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':
      JSON.stringify('local-fixture-only'),
  },
});
