import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const native = (path: string) =>
  new URL(`./src/native/${path}`, import.meta.url).pathname;
export default defineConfig(({ command }) => ({
  plugins: [
    voidPlugin(),
    tanstackStart({
      start: { entry: './start.ts' },
      router: {
        enableRouteGeneration: true,
        routesDirectory: 'routes',
        generatedRouteTree: 'routeTree.gen.ts',
        routeTreeFileHeader: [],
        disableTypes: false,
      },
      serverFns: { base: '/_serverFn' },
      importProtection: {
        behavior: 'error',
        client: {
          specifiers: [
            'node:async_hooks',
            'bcryptjs',
            '@tuturuuu/utils/api-proxy-guard',
            '@tuturuuu/supabase/next/server',
          ],
          files: [/\.server\.[cm]?[jt]sx?$/],
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
  environments: {
    client: {
      define: {
        'process.env': JSON.stringify({
          ...Object.fromEntries(
            Object.entries(process.env).filter(([name]) =>
              name.startsWith('NEXT_PUBLIC_')
            )
          ),
          NODE_ENV:
            process.env.NODE_ENV ??
            (command === 'build' ? 'production' : 'development'),
        }),
      },
    },
  },
  resolve: {
    alias: [
      { find: /^next\/headers$/, replacement: native('request-context.ts') },
      { find: /^next\/server$/, replacement: native('next-server.ts') },
      { find: '@/', replacement: new URL('./src/', import.meta.url).pathname },
    ],
  },
}));
