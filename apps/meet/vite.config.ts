import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { MEET_FUNCTION_BASE } from './src/runtime/native-function-config';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [
    voidPlugin(),
    tanstackStart({
      serverFns: { base: MEET_FUNCTION_BASE },
      router: { enableRouteGeneration: false },
      rsc: { enabled: false },
      importProtection: {
        behavior: 'error',
        client: {
          specifiers: [
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
        find: /^next\/headers$/u,
        replacement: local('./src/runtime/request-context.ts'),
      },
      {
        find: /^next\/cache$/u,
        replacement: local('./src/runtime/request-cache.ts'),
      },
      {
        find: /^@tuturuuu\/apis\/meet\/actions$/u,
        replacement: local('./src/runtime/legacy-plan-actions.ts'),
      },
      {
        find: /^next\/server$/u,
        replacement: local('./src/runtime/next-server.ts'),
      },
      {
        find: /^next\/navigation$/u,
        replacement: local('./src/runtime/next-navigation.tsx'),
      },
      {
        find: /^next\/link$/u,
        replacement: local('./src/runtime/next-link.tsx'),
      },
      {
        find: /^next\/dynamic$/u,
        replacement: local('./src/runtime/next-dynamic.tsx'),
      },
      {
        find: /^next\/image$/u,
        replacement: local('./src/runtime/next-image.tsx'),
      },
      {
        find: /^next\/og$/u,
        replacement: '@cloudflare/pages-plugin-vercel-og/api',
      },
      {
        find: /^next-intl\/server$/u,
        replacement: local('./src/runtime/intl-server.ts'),
      },
      {
        find: /^@opennextjs\/cloudflare$/u,
        replacement: local('./src/runtime/cloudflare-context.ts'),
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
        find: /^server-only$/u,
        replacement: '@tanstack/react-start/server-only',
      },
    ],
  },
  define: {
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
      define: {
        'process.env': JSON.stringify({
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) =>
              key.startsWith('NEXT_PUBLIC_')
            )
          ),
          NODE_ENV: command === 'serve' ? 'development' : 'production',
        }),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 7807),
    strictPort: true,
  },
}));
