import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig, type UserConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const local = (path: string) => new URL(path, import.meta.url).pathname;

// `'use server'` modules reached from client code, by resolved path, and the
// server-function port that replaces them in the native build.
const ACTION_PORTS = new Set([
  local('./src/app/[locale]/(dashboard)/[wsId]/actions.ts'),
  local('./src/components/settings/template-marketplace-actions.ts'),
  local('../../packages/satellite/src/utils/workspace-actions.ts'),
  local('../../packages/supabase/src/next/realtime-log-actions.ts'),
]);
const ACTION_PORT_MODULE = local('./src/runtime/action-ports.ts');
const ACTION_PORT_SPECIFIER = /(?:^|\/)(?:actions|[a-z-]+-actions)$/u;

const actionPorts: Plugin = {
  name: 'tasks-native-action-ports',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (
      !importer ||
      !ACTION_PORT_SPECIFIER.test(source) ||
      importer.includes('/src/runtime/action-ports')
    )
      return;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    const id = resolved?.id.split('?')[0];
    return id && ACTION_PORTS.has(id) ? ACTION_PORT_MODULE : undefined;
  },
};

// Native Tasks candidate: the App Router source compiled by TanStack Start
// through @tuturuuu/start-bridge. `next build` (package `build`) stays the
// production path until a cutover PR; this config is `build:cloudflare`.
// CommonJS packages whose Node entry calls `require('tty')`, which cannot run
// in the ESM Worker output (`debug` picks its Node build whenever `process`
// exists). Use each package's declared `browser` entry instead (no colour, no
// tty), which is right for Worker logs. ESM releases with `exports` maps
// (supports-color 10) are left alone.
const NODE_ONLY_CJS = new Set(['debug', 'supports-color']);

function packageRoot(file: string, name: string) {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name?: string;
      browser?: unknown;
      exports?: unknown;
    };
    if (parsed.name === name) return { dir, manifest: parsed };
  }
  return null;
}

const workerCjsBrowserEntries: Plugin = {
  name: 'tasks-worker-cjs-browser-entries',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!NODE_ONLY_CJS.has(source) || !importer) return;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    const root = resolved && packageRoot(resolved.id, source);
    if (!root || root.manifest.exports) return;
    const { browser } = root.manifest;
    return typeof browser === 'string' ? join(root.dir, browser) : undefined;
  },
};

const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'tasks',
  aliases: {
    'next-intl/server': local('./src/runtime/intl-server.ts'),
    '@tuturuuu/satellite/i18n':
      '@tuturuuu/start-bridge/intl/localized-navigation',
    'server-only': '@tanstack/react-start/server-only',
  },
  serverOnlySpecifiers: [
    'server-only',
    'next/headers',
    '@tuturuuu/supabase/next/server',
    '@tuturuuu/satellite/auth',
  ],
});

export default defineConfig(
  ({ command }): UserConfig => ({
    base: bridge.base,
    define: bridge.define,
    plugins: [
      actionPorts,
      workerCjsBrowserEntries,
      voidPlugin(),
      tanstackStart({ ...bridge.tanstackStart, rsc: { enabled: false } }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      tsconfigPaths: true,
      conditions: ['bun', 'module', 'browser', 'development|production'],
      alias: bridge.alias,
    },
    environments: {
      client: { define: bridge.clientDefine(command) },
      // The Worker bundle has circular chunks (a dayjs CJS interop wrapper
      // was called before its chunk initialized); run module bodies in source
      // order instead of chunk order.
      ssr: {
        build: { rolldownOptions: { output: { strictExecutionOrder: true } } },
      },
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PORT ?? 7809),
      strictPort: true,
    },
  })
);
