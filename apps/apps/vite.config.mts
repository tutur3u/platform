import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  root: new URL('./src/portable', import.meta.url).pathname,
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: new URL('./wrangler.staging.jsonc', import.meta.url).pathname,
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
    }),
    {
      name: 'apps-public-framework-boundary',
      generateBundle() {
        const forbidden = [...this.getModuleIds()].filter((id) =>
          /\/node_modules\/(next|next-intl)\//.test(id)
        );
        if (forbidden.length)
          this.error(
            `Public gateway must remain framework independent: ${forbidden.join(', ')}`
          );
      },
    },
  ],
  environments: {
    client: {
      build: { outDir: new URL('./dist/client', import.meta.url).pathname },
    },
    worker: {
      build: { outDir: new URL('./dist/worker', import.meta.url).pathname },
    },
  },
});
