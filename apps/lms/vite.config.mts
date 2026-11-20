import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { LMS_BASE } from './cloudflare/routing';

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'lms',
  basePath: LMS_BASE,
});

export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: bridge.define,
  plugins: [
    voidPlugin(),
    tanstackStart(bridge.tanstackStart),
    react(),
    tailwindcss(),
  ],
  environments: { client: { define: bridge.clientDefine(command) } },
  resolve: { alias: bridge.alias },
  tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
}));
