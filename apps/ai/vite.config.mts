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
  app: 'ai',
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
      name: 'ai-required-startup-bindings',
      apply: 'build',
      enforce: 'pre',
      transform(code, id) {
        if (
          id.split('?')[0] !==
          new URL('./cloudflare/worker.ts', import.meta.url).pathname
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
