import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';
import { PRODUCTION_DEFINES } from './src/build-defines';

export default defineConfig({
  server: { host: '127.0.0.1', port: 8801 },
  // The deployed build never contains the unchecked transaction path.
  define: { ...PRODUCTION_DEFINES },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
      persistState: {
        path: process.env.CF_VITE_TEST_PERSIST_PATH ?? '.cloudflare/state',
      },
      // Read cloudflare.config.ts and emit the cf Build Output Specification
      // (.cloudflare/output/v0) that `cf deploy --prebuilt` publishes.
      experimental: { newConfig: { cfBuildOutput: true } },
    }),
  ],
  // No source maps in the emitted artifact.
  environments: { worker: { build: { sourcemap: false } } },
});
