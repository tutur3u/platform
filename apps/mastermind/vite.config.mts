import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'mastermind',
  basePath: '',
  shims: [],
});
export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: bridge.define,
  plugins: [voidPlugin(), tanstackStart(bridge.tanstackStart), react()],
  environments: { client: { define: bridge.clientDefine(command) } },
  resolve: { alias: bridge.alias },
}));
