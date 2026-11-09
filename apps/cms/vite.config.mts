import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import { startBridgeRscPlugin } from '@tuturuuu/start-bridge/vite/rsc';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'cms',
  rsc: true,
  serverOnlySpecifiers: [
    '@tuturuuu/satellite/auth',
    '@tuturuuu/utils/api-proxy-guard',
    '@tuturuuu/supabase/next/server',
  ],
});

export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: {
    ...bridge.define,
    'process.env.NODE_ENV': JSON.stringify(
      command === 'build' ? 'production' : 'development'
    ),
  },
  plugins: [
    {
      name: 'cms-required-startup-bindings',
      apply: 'build',
      enforce: 'pre',
      transform(code, id) {
        if (
          id.split('?')[0] !==
          fileURLToPath(new URL('./cloudflare/worker.ts', import.meta.url))
        )
          return;
        return {
          code: `import { env as nativeStartupEnv } from 'cloudflare:workers';
if (process.env.NODE_ENV !== 'production') throw new Error('Native Worker requires NODE_ENV=production');
for (const name of ['TUTURUUU_APP_COORDINATION_SECRET', 'SUPABASE_SECRET_KEY']) {
  const value = nativeStartupEnv[name];
  if (typeof value !== 'string' || !value.trim() || value.trim().startsWith('tuturuuu-local-development-')) {
    throw new Error('Missing or unsafe required secret: ' + name);
  }
}
const legacyUpstash = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].every(name => typeof nativeStartupEnv[name] === 'string' && nativeStartupEnv[name].trim());
const bindingMode = nativeStartupEnv.ABUSE_GUARD && typeof nativeStartupEnv.ABUSE_GUARD === 'object';
const missingGuardNames = [];
if (!legacyUpstash && !bindingMode) missingGuardNames.push('ABUSE_GUARD');
if (!legacyUpstash && (typeof nativeStartupEnv.ABUSE_GUARD_KEY_PEPPER !== 'string' || !nativeStartupEnv.ABUSE_GUARD_KEY_PEPPER.trim())) missingGuardNames.push('ABUSE_GUARD_KEY_PEPPER');
if (!legacyUpstash && (typeof nativeStartupEnv.ABUSE_GUARD_FAMILIES !== 'string' || !nativeStartupEnv.ABUSE_GUARD_FAMILIES.trim())) missingGuardNames.push('ABUSE_GUARD_FAMILIES');
if (!legacyUpstash && missingGuardNames.length) throw new Error('Missing required abuse guard names: ' + missingGuardNames.join(', '));
for (const name of ['APP_COORDINATION_TOKEN_SECRET', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (nativeStartupEnv[name]?.trim().startsWith('tuturuuu-local-development-')) throw new Error('Development signing secret forbidden: ' + name);
}
${code}`,
          map: null,
        };
      },
    },
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
