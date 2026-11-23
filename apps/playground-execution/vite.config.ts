import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';

// `cf build` drives this Vite build: the plugin reads cloudflare.config.ts and
// emits the Build Output (.cloudflare/output) that `cf deploy --prebuilt` ships.
export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  environments: { worker: { build: { sourcemap: false } } },
});
