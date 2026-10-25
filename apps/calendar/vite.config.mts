import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import { startBridgeNodeBuiltinsPlugin } from '@tuturuuu/start-bridge/vite/rsc';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { CALENDAR_FUNCTION_BASE } from './src/runtime/native-function-config';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'calendar',
  inertVercel: true,
  serverFnBase: CALENDAR_FUNCTION_BASE,
  shims: [
    'next/headers',
    'next/cache',
    'next/server',
    'next/navigation',
    'next/link',
    'next/dynamic',
    'next/image',
    '@opennextjs/cloudflare',
  ],
});
export default defineConfig(
  ({ command }): UserConfig => ({
    base: bridge.base,
    experimental: bridge.experimental,
    plugins: [
      {
        name: 'calendar-owned-native-ports',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer) return;
          if (
            importer.endsWith(
              '/packages/satellite/src/components/workspace-settings/settings-workspace-breadcrumb.tsx'
            ) &&
            source === '../../utils/workspace-actions'
          )
            return local('./src/runtime/workspace-actions.ts');
          if (
            importer.endsWith(
              '/packages/supabase/src/next/realtime-log-provider.tsx'
            ) &&
            source === './realtime-log-actions'
          )
            return local('./src/runtime/realtime-log-actions.ts');
          if (
            importer.includes('/apps/calendar/') &&
            !importer.endsWith('/legacy-telemetry-supplier.server.ts') &&
            /(?:^|\/)infrastructure\/log-drain$/u.test(source)
          )
            return local('./src/runtime/request-telemetry.server.ts');
          if (
            importer.includes('/apps/calendar/') &&
            /(?:^|\/)actions$/u.test(source) &&
            importer.includes('/(dashboard)/[wsId]/')
          )
            return local('./src/runtime/workspace-actions.ts');
        },
      },
      startBridgeNodeBuiltinsPlugin(),
      voidPlugin(),
      tanstackStart({
        start: bridge.tanstackStart.start,
        serverFns: bridge.tanstackStart.serverFns,
        router: {
          enableRouteGeneration: true,
          routesDirectory: 'routes',
          generatedRouteTree: 'routeTree.gen.ts',
          routeTreeFileHeader: [],
        },
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
          find: /^#calendar-handler$/u,
          replacement: local('./src/runtime/handler.ts'),
        },
        {
          find: /^@tuturuuu\/tasks-ui\/tu-do\/boards\/boardId\/task-board-page-model$/u,
          replacement: local(
            '../../packages/tasks-ui/src/tu-do/boards/boardId/task-board-page-model.ts'
          ),
        },
        {
          find: /^@calendar-workspace-actions$/u,
          replacement: local('./src/runtime/workspace-actions.ts'),
        },
        {
          find: /^@calendar-request-telemetry$/u,
          replacement: local('./src/runtime/request-telemetry.server.ts'),
        },

        ...bridge.alias,
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
    worker: {
      format: 'iife',
      rollupOptions: { output: { entryFileNames: 'serwist/sw.js' } },
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
        process.env.NEXT_PUBLIC_APP_URL ?? 'https://calendar.tuturuuu.com'
      ),
      'process.env.NEXT_PUBLIC_WEB_APP_URL': JSON.stringify(
        process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'https://tuturuuu.com'
      ),
    },
    environments: {
      client: {
        define: {
          ...bridge.clientDefine(command),
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PORT ?? 7806),
      strictPort: true,
    },
  })
);
