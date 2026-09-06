import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'colab-framework-boundary',
      generateBundle() {
        const frameworkModules = [...this.getModuleIds()].filter((id) =>
          /\/node_modules\/(next|next-intl)\//.test(id)
        );
        if (frameworkModules.length)
          this.error(
            `Colab shell must remain framework independent: ${frameworkModules.join(', ')}`
          );
      },
    },
  ],
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
