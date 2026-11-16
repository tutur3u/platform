import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import {
  startBridgeNodeBuiltinsPlugin,
  startBridgeRscPlugin,
} from '@tuturuuu/start-bridge/vite/rsc';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { deploymentProfile } from './cloudflare/deployment-profile';

const profile = process.env.VITE_MIND_NATIVE_PROFILE ?? 'staging';
const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'mind',
  basePath: deploymentProfile(profile).basePath,
  rsc: true,
  serverOnlySpecifiers: [
    '@tuturuuu/satellite/auth',
    '@tuturuuu/utils/api-proxy-guard',
    '@tuturuuu/supabase/next/server',
  ],
});

export default defineConfig(({ command }) => ({
  base: bridge.base,
  experimental: bridge.experimental,
  define: {
    ...bridge.define,
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VITE_MIND_NATIVE_PROFILE': JSON.stringify(profile),
  },
  plugins: [
    startBridgeRscPlugin({
      rscEntries: {
        'bridge-api': new URL(
          './src/start-bridge/api-entry.ts',
          import.meta.url
        ),
        'bridge-pages': new URL(
          './src/start-bridge/page-modules.bridge.gen.ts',
          import.meta.url
        ),
      },
    }),
    // SSR bundles CommonJS too (postcss via sanitize-html requires 'path'):
    // the same Node built-in conversion the rsc environment always gets.
    startBridgeNodeBuiltinsPlugin(),
    voidPlugin(),
    tanstackStart(bridge.tanstackStart),
    rsc(),
    react(),
    tailwindcss(),
  ],
  environments: {
    client: { define: bridge.clientDefine(command) },
  },
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/start-bridge\/function-proxy$/u,
        replacement: fileURLToPath(
          new URL('./src/runtime/function-proxy.ts', import.meta.url)
        ),
      },
      ...bridge.alias,
    ],
  },
}));
