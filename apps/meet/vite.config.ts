import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { MEET_FUNCTION_BASE } from './src/runtime/native-function-config';

const meetRequire = createRequire(import.meta.url);

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'meet',
  serverFnBase: MEET_FUNCTION_BASE,
  srcAlias: false,
});

export default defineConfig(({ command }) => ({
  base: bridge.base,
  experimental: bridge.experimental,
  plugins: [
    voidPlugin(),
    tanstackStart({
      ...bridge.tanstackStart,
      rsc: { enabled: false },
      importProtection: {
        behavior: 'error',
        client: {
          files: bridge.tanstackStart.importProtection.client.files,
          specifiers: [
            ...bridge.tanstackStart.importProtection.client.specifiers,
            'server-only',
            'next/headers',
            '@tuturuuu/supabase/next/server',
          ],
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    conditions: ['bun', 'module', 'browser', 'development|production'],
    alias: [
      {
        find: /^@tuturuuu\/apis\/meet\/actions$/u,
        replacement: local('./src/runtime/legacy-plan-actions.ts'),
      },
      {
        find: /^next\/og$/u,
        replacement: meetRequire.resolve(
          '@cloudflare/pages-plugin-vercel-og/api'
        ),
      },
      {
        find: /^next-intl\/server$/u,
        replacement: local('./src/runtime/intl-server.ts'),
      },
      {
        find: /^@tuturuuu\/satellite\/i18n$/u,
        replacement: local('./src/runtime/satellite-i18n.tsx'),
      },
      {
        find: /^@tuturuuu\/supabase\/next\/client$/u,
        replacement: local('../../packages/supabase/src/next/client.ts'),
      },
      {
        // The package builds as CommonJS, which bundles the entire client into
        // every page; the ESM source lets rolldown tree-shake per import.
        find: /^@tuturuuu\/internal-api$/u,
        replacement: local('../../packages/internal-api/src/index.ts'),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/u,
        replacement: local('../../packages/internal-api/src/$1.ts'),
      },
      ...bridge.alias,
      {
        find: /^server-only$/u,
        replacement: '@tanstack/react-start/server-only',
      },
    ],
  },
  define: {
    ...bridge.define,
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ),
    'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ),
    'process.env.NEXT_PUBLIC_APP_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_APP_URL ?? 'https://meet.tuturuuu.com'
    ),
    'process.env.NEXT_PUBLIC_WEB_APP_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'https://tuturuuu.com'
    ),
    'process.env.NEXT_PUBLIC_MEETING_APP': JSON.stringify('meet'),
  },
  environments: {
    client: {
      define: bridge.clientDefine(command),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 7807),
    strictPort: true,
  },
}));
