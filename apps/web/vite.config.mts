import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'web',
  shims: [],
  srcAlias: false,
  intlRequestConfig: false,
});

export default defineConfig({
  publicDir: false,
  experimental: bridge.experimental,
  plugins: [
    voidPlugin(),
    tanstackStart({
      srcDirectory: 'start',
      rsc: { enabled: false },
      router: { routeTreeFileHeader: [] },
    }),
    react(),
  ],
  server: { host: '127.0.0.1' },
});
