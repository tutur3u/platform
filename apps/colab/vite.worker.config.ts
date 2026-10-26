// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: disposable CI persistence override.
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';
import clientConfig from './vite.config';

export default defineConfig({
  ...clientConfig,
  // Keep the Worker's production CSP while serving source UI without inline refresh.
  server: { host: '127.0.0.1', port: 8795, strictPort: true, hmr: false },
  plugins: [
    ...(clientConfig.plugins ?? []),
    cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
      persistState: process.env.CF_VITE_TEST_PERSIST_PATH
        ? { path: process.env.CF_VITE_TEST_PERSIST_PATH }
        : true,
    }),
  ],
});
