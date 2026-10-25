// Renders the files the codemod owns. Every template is a pure function of
// the resolved options so dry-run, apply and re-runs produce identical bytes.

import {
  API_REGISTRY,
  API_RSC_ENTRY,
  BRIDGE,
  FUNCTION_BASE,
  GENERATED_MARKER,
  PAGE_MANIFEST,
  PAGE_MODULES,
  PAGES_RSC_ENTRY,
  PUBLIC_ASSETS,
  RUNTIME,
} from './contract.mjs';

const moduleFrom = (fromDir, file) =>
  `${fromDir}${file.replace(/\.tsx?$/u, '')}`;

const header = (app, comment = '//') =>
  `${comment} ${GENERATED_MARKER} for ${app}; re-run it instead of editing.\n`;

export function pascal(app) {
  return app
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const quote = (value) => `'${String(value).replace(/['\\]/gu, '\\$&')}'`;

export function viteConfig({ app, navigation, serverOnlySpecifiers }) {
  const options = [
    `appRoot: import.meta.url`,
    `app: ${quote(app)}`,
    'rsc: true',
  ];
  if (navigation !== 'router') options.push(`navigation: ${quote(navigation)}`);
  if (serverOnlySpecifiers.length > 0)
    options.push(
      `serverOnlySpecifiers: [${serverOnlySpecifiers.map(quote).join(', ')}]`
    );
  const pluginOptions = [
    ...(navigation === 'router' ? [] : [`navigation: ${quote(navigation)}`]),
    `rscEntries: { ${quote(API_RSC_ENTRY)}: new URL(${quote(`./${API_REGISTRY}`)}, import.meta.url), ${quote(PAGES_RSC_ENTRY)}: new URL(${quote(`./${PAGE_MODULES}`)}, import.meta.url) }`,
  ];
  return `${header(app)}import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '${BRIDGE.vitePreset}';
import { startBridgeRscPlugin } from '${BRIDGE.viteRsc}';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

const bridge = startBridgePreset({
${options.map((option) => `  ${option},`).join('\n')}
});

export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: bridge.define,
  plugins: [
    startBridgeRscPlugin({ ${pluginOptions.join(', ')} }),
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
`;
}

export function voidConfig({ app, workerName }) {
  const flags = RUNTIME.compatibilityFlags.map(quote).join(', ');
  return `${header(app)}import { defineConfig } from 'void/config';

// Staging candidate only: production stays held in tuturuuu.ci.ts until an
// explicitly reviewed cutover PR admits this app.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: ${quote(workerName)},
    main: './cloudflare/worker.ts',
    compatibility_date: ${quote(RUNTIME.compatibilityDate)},
    compatibility_flags: [${flags}],
    workers_dev: true,
    vars: { TUTURUUU_NOINDEX: '1' },
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});
`;
}

export function workerEntry({ app, proxyModule, rootHost }) {
  const name = `${pascal(app)}Environment`;
  const registry = moduleFrom('../', API_REGISTRY);
  return `${header(app)}/// <reference types="@vitejs/plugin-rsc/types" />
import { createFunctionProxy } from '${BRIDGE.functionProxy}';
import { createBridgeHandler } from '${BRIDGE.handler}';
import { createBridgeStartHandler } from '${BRIDGE.serverEntry}';
import { proxy } from '${proxyModule}';
import { publicAssets } from '${moduleFrom('../', PUBLIC_ASSETS)}';

export interface ${name} {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiRegistry = typeof import('${registry}');

// Route handlers are server code (\`server-only\` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const handler = (
  import.meta.viteRsc.loadModule('rsc', ${quote(API_RSC_ENTRY)}) as Promise<ApiRegistry>
).then(({ endpoints }) =>
  createBridgeHandler<${name}, WorkerContext>({
    // One artifact: the subdomain root and the tuturuuu.com/${app} mount.
    mounts: {
      app: ${quote(app)},
      rootHosts: [${quote(rootHost)}],
      mountHosts: ['tuturuuu.com'],
      basePath: ${quote(`/${app}`)},
    },
    start: createBridgeStartHandler(),
    serverFnBase: ${quote(FUNCTION_BASE)},
    proxy,
    endpoints,
    functionBase: ${quote(FUNCTION_BASE)},
    functionProxy: createFunctionProxy({ targetApp: ${quote(app)} }),
    publicAssets,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  })
);

export default {
  async fetch(request: Request, env: ${name}, ctx: WorkerContext) {
    return (await handler)(request, env, ctx);
  },
};
`;
}

export function publicAssetsModule({ app, publicFiles }) {
  const entries = publicFiles.map((file) => `  ${quote(`/${file}`)},`);
  return `${header(app)}export const publicAssets: ReadonlySet<string> = new Set([
${entries.join('\n')}
]);
`;
}

export function startEntry({ app }) {
  return `${header(app)}import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { bridgeServerFnFetch } from '${BRIDGE.startBasePath}';

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  // Server functions follow the request's mount (/_serverFn or /<app>/_serverFn).
  serverFns: { fetch: bridgeServerFnFetch },
}));
`;
}

export function routerEntry({ app }) {
  return `${header(app)}import { createRouter } from '@tanstack/react-router';
import { requestNonce } from '${BRIDGE.csp}';
import { routerBasepath } from '${BRIDGE.startBasePath}';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    // The response's CSP nonce when the Worker enforces \`csp\`; else none.
    ssr: { nonce: requestNonce() },
    scrollRestoration: true,
    defaultPreload: false,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`;
}

/** Root route: the shell lifts the root layout's <html>/<body> attributes. */
export function rootRoute({ app }) {
  return `${header(app)}import { createRootRoute } from '@tanstack/react-router';
import { createBridgeRootRoute } from '${BRIDGE.pageRoute}';

export const Route = createRootRoute(createBridgeRootRoute());
`;
}

/**
 * Lazy page and layout-chain imports keyed by the manifest's `file`. Only the
 * server function references this module, so Start strips it from the client.
 */
export function pageModulesModule({ app, appDir, pages }) {
  const relative = (file) =>
    `../${appDir.slice('src/'.length)}/${file.replace(/\.[cm]?[jt]sx?$/u, '')}`;
  const entries = pages.map(
    (page) => `  ${quote(`${appDir}/${page.file}`)}: {
    page: () => import(${quote(relative(page.file))}),
    layouts: [${page.wrappers.map((wrapper) => `\n      () => import(${quote(relative(wrapper))}),`).join('')}${page.wrappers.length ? '\n    ' : ''}],
  },`
  );
  return `${header(app)}import type { BridgePageModules } from '${BRIDGE.pageRender}';
import type { pages } from '${moduleFrom('./', PAGE_MANIFEST.slice('src/start-bridge/'.length))}';

type PageFile = (typeof pages)[number]['file'];

export const pageModules = {
${entries.join('\n')}
} satisfies Record<PageFile, BridgePageModules>;
`;
}

/** The generic page adapter's server function and Start route options. */
export function pageRouteModule({ app, pageProxyModule }) {
  // Client navigation runs the app proxy for the target (rewrites, redirects).
  const proxyImport = pageProxyModule
    ? `import { proxy } from '${pageProxyModule}';\n`
    : '';
  return `${header(app)}import { createServerFn } from '@tanstack/react-start';
import { renderServerComponent } from '@tanstack/react-start/rsc';
import { resolvePageLocation } from '${BRIDGE.pageLocation}';
import { resolveBridgePage } from '${BRIDGE.pageRender}';
import { createBridgePageRoute } from '${BRIDGE.pageRoute}';
import {
  installServerActionCallback,
  runServerAction,
  type ServerActionCall,
} from '${BRIDGE.serverActions}';
${proxyImport}import { pageModules } from '${moduleFrom('./', PAGE_MODULES.slice('src/start-bridge/'.length))}';
import { pages } from '${moduleFrom('./', PAGE_MANIFEST.slice('src/start-bridge/'.length))}';

const loadPage = createServerFn({ method: 'GET' })
  .validator((href: string) => href)
  .handler(async ({ data }) => {
    const page = await resolveBridgePage({
      // The location the app sees: proxy rewrites apply, the URL stays.
      href: await resolvePageLocation(data, {
        ${pageProxyModule ? 'proxy,\n        ' : ''}serverFnBase: ${quote(FUNCTION_BASE)},
      }),
      pages,
      modules: pageModules,
    });
    if (!page) return null;
    const { element, ...document } = page;
    return { ...document, content: await renderServerComponent(element) };
  });

// React server actions ('use server') run through a Start server function.
// An action may return any value React can serialize, so only the input (a
// JSON call; see start/server-actions) is checked statically.
const callServerAction = createServerFn({
  method: 'POST',
  strict: { output: false },
})
  .validator((input: ServerActionCall) => input)
  .handler(({ data }) => runServerAction(data));
void installServerActionCallback((input) => callServerAction({ data: input }));

// A fresh options object per route: Start writes route ids into it.
export const bridgePageRoute = () =>
  createBridgePageRoute({ load: (href) => loadPage({ data: href }) });
`;
}

export function pageRouteFile({ app, path }) {
  return `${header(app)}import { createFileRoute } from '@tanstack/react-router';
import { bridgePageRoute } from '../start-bridge/page-route';

export const Route = createFileRoute(${quote(path)})(bridgePageRoute());
`;
}

/** TanStack Router generator output for exactly __root, / and /$. */
export const ROUTE_TREE = `// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as SplatRouteImport } from './routes/$'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const SplatRoute = SplatRouteImport.update({
  id: '/$',
  path: '/$',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/$'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/$'
  id: '__root__' | '/' | '/$'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  SplatRoute: typeof SplatRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$': {
      id: '/$'
      path: '/$'
      fullPath: '/$'
      preLoaderRoute: typeof SplatRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  SplatRoute: SplatRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
`;

export function cloudflareTsconfig({ app }) {
  return `${JSON.stringify(
    {
      $comment: `${GENERATED_MARKER} for ${app}; re-run it instead of editing.`,
      extends: './tsconfig.json',
      compilerOptions: {
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        noEmit: true,
        composite: false,
        declaration: false,
        declarationMap: false,
        incremental: false,
        plugins: [],
        // No global @cloudflare/workers-types: they retype `Response` for the
        // whole app (`json()` becomes unknown); the Worker entry types its env.
        types: ['vite/client', 'node'],
      },
      include: [
        'src',
        'cloudflare',
        'global.d.ts',
        'messages',
        'vite.config.mts',
        'void.config.ts',
      ],
      exclude: ['node_modules', 'dist', '.turbo', '.next'],
    },
    null,
    2
  )}\n`;
}
