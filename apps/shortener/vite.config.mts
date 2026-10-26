import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

// Shortener renders no App Router source; only shared server modules reached
// by the API guard need the next/headers and next/server ports.
const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'shortener',
  shims: ['next/headers', 'next/server'],
  serverOnlySpecifiers: [
    'bcryptjs',
    '@tuturuuu/utils/api-proxy-guard',
    '@tuturuuu/supabase/next/server',
  ],
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
  environments: {
    client: { define: bridge.clientDefine(command) },
  },
  resolve: { alias: bridge.alias },
}));
