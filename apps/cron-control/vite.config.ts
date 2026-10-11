import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: './wrangler.jsonc',
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  environments: { worker: { build: { outDir: 'dist/worker' } } },
});
