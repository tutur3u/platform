import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

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
      serverFns: { base: '/_passwords/functions' },
      importProtection: {
        behavior: 'error',
        client: {
          specifiers: ['node:async_hooks'],
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
          NODE_ENV:
            process.env.NODE_ENV ??
            (command === 'build' ? 'production' : 'development'),
        }),
      },
    },
  },
  resolve: {
    alias: [
      { find: '@/', replacement: new URL('./src/', import.meta.url).pathname },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 7829),
    strictPort: true,
  },
}));
