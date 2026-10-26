import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

// The gateway navigates by document load, so it keeps the document-mode
// navigation adapter and only the next/* shims it has always aliased.
const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'apps',
  navigation: 'document',
  shims: [
    'next/headers',
    'next/server',
    'next/navigation',
    'next/link',
    'next-intl',
  ],
  serverOnlySpecifiers: [
    '@tuturuuu/satellite/auth',
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
