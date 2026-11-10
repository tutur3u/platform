// Shared bridge preset with a build-time staging identity fence.
import tailwindcss from '@tailwindcss/vite';
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
import productionVars from './cloudflare/production-profile.json';
import { stagingVars } from './src/start-candidate/staging-policy';

const production = process.env.VITE_DRIVE_NATIVE_PROFILE === 'production';
for (const [name, expected] of Object.entries(
  production ? productionVars : stagingVars
)) {
  if (process.env[name] && process.env[name] !== expected) {
    throw new Error(`Drive profile refuses mismatched ${name}`);
  }
}

const bridge = startBridgePreset(
  {
    appRoot: import.meta.url,
    app: 'drive',
    rsc: true,
    serverOnlySpecifiers: [
      '@tuturuuu/satellite/auth',
      '@tuturuuu/utils/api-proxy-guard',
      '@tuturuuu/supabase/next/server',
    ],
  },
  { ...process.env, ...(production ? productionVars : stagingVars) }
);

export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: {
    ...bridge.define,
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VITE_DRIVE_NATIVE_PROFILE': JSON.stringify(
      process.env.VITE_DRIVE_NATIVE_PROFILE ?? 'staging'
    ),
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
  resolve: { alias: bridge.alias },
}));
