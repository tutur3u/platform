import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  server: { host: '127.0.0.1', port: 8797, strictPort: true },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
      persistState: { path: '.cloudflare/state' },
      // Read cloudflare.config.ts and emit the cf Build Output Specification
      // (.cloudflare/output/v0) that `cf deploy --prebuilt` publishes.
      experimental: { newConfig: { cfBuildOutput: true } },
    }),
  ],
});
