// Renders the files the codemod owns. Every template is a pure function of
// the resolved options so dry-run, apply and re-runs produce identical bytes.

import {
  API_ENTRY,
  API_PATTERNS,
  API_REGISTRY,
  API_RSC_ENTRY,
  APP_CONFIG,
  BRIDGE,
  CENTRAL_FIRST,
  FUNCTION_BASE,
  GENERATED_MARKER,
  OG_PACKAGE,
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

export function viteConfig({ app, navigation, serverOnlySpecifiers, og }) {
  const options = [
    `appRoot: import.meta.url`,
    `app: ${quote(app)}`,
    'rsc: true',
  ];
  // `next/og` renders through the Workers port Meet uses.
  if (og) options.push(`og: ${quote(`${OG_PACKAGE}/api`)}`);
  if (navigation !== 'router') options.push(`navigation: ${quote(navigation)}`);
  if (serverOnlySpecifiers.length > 0)
    options.push(
      `serverOnlySpecifiers: [${serverOnlySpecifiers.map(quote).join(', ')}]`
    );
  const pluginOptions = [
    ...(navigation === 'router' ? [] : [`navigation: ${quote(navigation)}`]),
    `rscEntries: { ${quote(API_RSC_ENTRY)}: new URL(${quote(`./${API_ENTRY}`)}, import.meta.url), ${quote(PAGES_RSC_ENTRY)}: new URL(${quote(`./${PAGE_MODULES}`)}, import.meta.url) }`,
  ];
  return `${header(app)}import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '${BRIDGE.vitePreset}';
import {
  startBridgeNodeBuiltinsPlugin,
  startBridgeRscPlugin,
} from '${BRIDGE.viteRsc}';
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
}));
`;
}

export function voidConfig({ app, workerName, worker }) {
  const flags = worker.compatibilityFlags.map(quote).join(', ');
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
    workers_dev: ${worker.workersDev},
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

/**
 * The generated Worker's default mounts, before the app-owned
 * `start-bridge.config.ts` overrides them. The runtime test applies the same
 * defaults and overrides, so its root/apex expectations cannot drift.
 */
export function defaultMounts({ app, rootHost }) {
  return {
    rootHosts: [rootHost],
    mountHosts: ['tuturuuu.com'],
    basePath: `/${app}`,
  };
}

export function workerEntry({
  app,
  proxyModule,
  rootHost,
  proxyMatcher,
  assetsBinding,
  mounts: effectiveMounts,
  seoPolicy = null,
}) {
  const name = `${pascal(app)}Environment`;
  const mounts = effectiveMounts ?? defaultMounts({ app, rootHost });
  const mounted = mounts.mountHosts?.length > 0;
  const mountComment = mounted
    ? `// One artifact: the subdomain root and the ${mounts.mountHosts.join(', ')}${mounts.basePath} mount.`
    : `// Root-only: served at ${mounts.rootHosts.join(', ')}; no apex mount${
        mounts.unknownHost === 'reject'
          ? ', and unknown hosts are rejected'
          : ''
      }.`;
  const mountLines = [
    `  rootHosts: [${mounts.rootHosts.map(quote).join(', ')}],`,
    `  mountHosts: [${(mounts.mountHosts ?? []).map(quote).join(', ')}],`,
    ...(mounts.basePath && mounted
      ? [`  basePath: ${quote(mounts.basePath)},`]
      : []),
    ...(mounts.unknownHost
      ? [`  unknownHost: ${quote(mounts.unknownHost)} as const,`]
      : []),
  ];
  const proxyImport = proxyMatcher
    ? `import { config as proxyConfig, proxy } from '${proxyModule}';`
    : `import { proxy } from '${proxyModule}';`;
  const matcherImports = proxyMatcher
    ? `import { defaultProxyMatches } from '${BRIDGE.proxyBridge}';
import { createProxyMatcher } from '${BRIDGE.proxyMatcher}';
`
    : '';
  const matcherOption = proxyMatcher
    ? `
    // The proxy's own \`config.matcher\`, evaluated like Next.
    matches: createProxyMatcher(proxyConfig.matcher, defaultProxyMatches),`
    : '';
  // The portable binding (#6753): the Workers \`Fetcher\` satisfies it.
  const assetsImport = assetsBinding
    ? `import type { AssetsBinding } from '${BRIDGE.assets}';
`
    : '';
  const assetsType = assetsBinding
    ? 'AssetsBinding'
    : '{ fetch(request: Request): Promise<Response> }';
  return `${header(app)}/// <reference types="@vitejs/plugin-rsc/types" />
${assetsImport}import { createFunctionProxy } from '${BRIDGE.functionProxy}';
${matcherImports}import {
  bridgeErrorResponse,
  createBridgeHandler,
} from '${BRIDGE.handler}';
import { createBridgeStartHandler } from '${BRIDGE.serverEntry}';
${proxyImport}
import appConfig from '${moduleFrom('../', APP_CONFIG)}';
import { centralFirst } from '${moduleFrom('../', CENTRAL_FIRST)}';
import { publicAssets } from '${moduleFrom('../', PUBLIC_ASSETS)}';

export interface ${name} {
  ASSETS: ${assetsType};
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('${moduleFrom('../', API_ENTRY)}');

// Robots policy: this app's entry in packages/utils/src/seo-policy.json.
const seoPolicy = ${seoPolicy ? JSON.stringify(seoPolicy) : 'null'};

${mountComment}
const mounts = {
  app: ${quote(app)},
${mountLines.join('\n')}
  ...appConfig.mounts,
};

// Route handlers are server code (\`server-only\` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const handler = (
  import.meta.viteRsc.loadModule('rsc', ${quote(API_RSC_ENTRY)}) as Promise<ApiEntry>
).then(({ endpoints }) =>
  createBridgeHandler<${name}, WorkerContext>({
    mounts,
    csp: appConfig.csp,
    apiOrigin: appConfig.apiOrigin,
    framablePaths: appConfig.framablePaths,
    start: createBridgeStartHandler(),
    serverFnBase: ${quote(FUNCTION_BASE)},
    proxy,${matcherOption}
    endpoints,
    centralFirst,
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
    let response: Response;
    try {
      response = await (await handler)(request, env, ctx);
    } catch (error) {
      // Even a failed route load answers through the response policy.
      console.error('[start-bridge] worker failed', error);
      response = bridgeErrorResponse();
    }
    return appConfig.wrapResponse
      ? appConfig.wrapResponse(response, {
          request,
          env,
          mounts,
          publicAssets,
          framablePaths: appConfig.framablePaths,
          seoPolicy,
        })
      : response;
  },
};
`;
}

/** App-owned Worker options: written once when absent, never updated. */
export function appConfigModule({ app }) {
  return `// App-owned start-bridge Worker options for ${app}: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { appRobots, createRootResponsePolicy } from '${BRIDGE.responsePolicy}';
import { defineBridgeAppConfig } from '${BRIDGE.appConfig}';

export default defineBridgeAppConfig({
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse: createRootResponsePolicy({ seo: appRobots }),
});
`;
}

/** Paths the central Web API owns ahead of the app's routes. */
export function centralFirstModule({ app, workspaceApiCentralFirst }) {
  return workspaceApiCentralFirst
    ? `${header(app)}// next.config rewrites these to Web \`beforeFiles\`; the bridge does too.
export { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS as centralFirst } from '@tuturuuu/utils/next-config';
`
    : `${header(app)}// next.config has no \`beforeFiles\` Web rewrites for this app.
export const centralFirst: readonly string[] = [];
`;
}

/** The rsc \`bridge-api\` entry: registers the app base, exports the routes. */
export function apiEntryModule({ app, appBase }) {
  return `${header(app)}${appBase ? "import './app-base';\n" : ''}export { endpoints } from '${moduleFrom('./', API_REGISTRY.slice('src/start-bridge/'.length))}';
`;
}

/**
 * Registers internal-api's default app base once per environment bundle
 * (browser, ssr and rsc each carry their own internal-api module), tagged with
 * the app so cross-app helpers keep their owning app's origin.
 */
export function appBaseModule({ app }) {
  return `${header(app)}import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { createAppBaseResolver } from '${BRIDGE.appBase}';
import { appApiPatterns } from '${moduleFrom('./', API_PATTERNS.slice('src/start-bridge/'.length))}';
import { centralFirst } from '${moduleFrom('./', CENTRAL_FIRST.slice('src/start-bridge/'.length))}';

registerDefaultAppBaseResolver(
  createAppBaseResolver(appApiPatterns, centralFirst),
  { app: ${quote(app)} }
);
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

export function routerEntry({ app, appBase }) {
  return `${header(app)}${appBase ? "import './start-bridge/app-base';\n" : ''}import { createRouter } from '@tanstack/react-router';
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
export function pageRouteModule({ app, pageProxyModule, appBase }) {
  // Client navigation runs the app proxy for the target (rewrites, redirects).
  const proxyImport = pageProxyModule
    ? `import { proxy } from '${pageProxyModule}';\n`
    : '';
  return `${header(app)}${appBase ? "import './app-base';\n" : ''}import { createServerFn } from '@tanstack/react-start';
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
      // Tests keep their Next/Vitest type-check (and its jest-dom types);
      // vite.config.mts is validated by the real \`vp build\`.
      include: [
        'src',
        'cloudflare',
        'global.d.ts',
        'messages',
        'start-bridge.config.ts',
        'void.config.ts',
      ],
      exclude: [
        'node_modules',
        'dist',
        '.turbo',
        '.next',
        '**/*.test.ts',
        '**/*.test.tsx',
        'vitest.setup.ts',
      ],
    },
    null,
    2
  )}\n`;
}
