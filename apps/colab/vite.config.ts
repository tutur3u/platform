import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tuturuuu/internal-api/colab': new URL(
        '../../packages/internal-api/src/colab.ts',
        import.meta.url
      ).pathname,
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8795',
      '/auth': 'http://127.0.0.1:8795',
    },
  },
});
