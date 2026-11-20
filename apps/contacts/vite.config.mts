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
import { stagingProfile } from './cloudflare/profile';

for (const [key, expected] of Object.entries(productionVars)) {
  if (process.env[key] && process.env[key] !== expected) {
    throw new Error(`Contacts production profile refuses mismatched ${key}`);
  }
}

const bridge = startBridgePreset(
  {
    appRoot: import.meta.url,
    app: 'contacts',
    rsc: true,
    serverOnlySpecifiers: [
      '@tuturuuu/satellite/auth',
      '@tuturuuu/utils/api-proxy-guard',
      '@tuturuuu/supabase/next/server',
    ],
  },
  { ...process.env, ...productionVars }
);

export default defineConfig(({ command }) => {
  if (command === 'build') {
    const profile = process.env.VITE_CONTACTS_NATIVE_PROFILE ?? 'production';
    const supabase = URL.parse(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const fixtureOrigin = 'https://contacts-ci.supabase.invalid';
    const validSupabase =
      supabase?.protocol === 'https:' &&
      supabase.href === `${supabase.origin}/`;
    const isPreviewSupplier =
      supabase?.origin === stagingProfile.supabaseUrl ||
      supabase?.origin === fixtureOrigin;
    if (
      !validSupabase ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      (profile === 'preview' && !isPreviewSupplier) ||
      (profile === 'production' && isPreviewSupplier) ||
      (profile !== 'preview' && profile !== 'production')
    ) {
      throw new Error(
        'Contacts build needs public Supabase inputs for its profile'
      );
    }
  }
  return {
    base: bridge.base,
    experimental: bridge.experimental,
    define: {
      ...bridge.define,
      'process.env.NODE_ENV': JSON.stringify('production'),
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
  };
});
