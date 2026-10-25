import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Vite+/TanStack Start configuration fragments for a bridged app. Vite+ loads
 * workspace config dependencies with native Node type stripping, which cannot
 * resolve extensionless relative imports, so this module imports nothing but
 * Node built-ins. Its basePath rules mirror `createBasePath` (parity-tested).
 */
export const NEXT_SHIMS = {
  'next/headers': 'next/headers.ts',
  'next/server': 'next/server.ts',
  'next/cache': 'next/cache.ts',
  'next/navigation': 'next/navigation.tsx',
  'next/link': 'next/link.tsx',
  'next/image': 'next/image.tsx',
  'next/dynamic': 'next/dynamic.tsx',
  'next/root-params': 'next/root-params.ts',
  'next-intl': 'intl/use-intl.tsx',
  'next-intl/server': 'intl/next-intl-server.ts',
  'next-intl/routing': 'intl/routing.ts',
  'next-intl/navigation': 'intl/navigation.tsx',
  '@opennextjs/cloudflare': 'next/cloudflare-context.ts',
  '@tuturuuu/satellite/i18n': 'intl/localized-navigation.tsx',
} as const;
export type NextShim = keyof typeof NEXT_SHIMS;

export interface StartBridgePresetOptions {
  /** The app's `import.meta.url` (from `vite.config.*`). */
  appRoot: string | URL;
  /** Stable app id (cookie scope, function rate-limit prefix). */
  app: string;
  /** `''`/`/<app>`; defaults to `TUTURUUU_BASE_PATH` or the root. */
  basePath?: string;
  /** `router` (client navigation) or `document` (full page loads). */
  navigation?: 'router' | 'document';
  /** Shims to alias; defaults to every entry of `NEXT_SHIMS`. */
  shims?: readonly NextShim[];
  /** Extra exact-specifier aliases, applied before the shims. */
  aliases?: Record<string, string>;
  /** Aliases `@/` to `<appRoot>/src/` (default `true`). */
  srcAlias?: boolean;
  /** App-relative server-function base (default `/_serverFn`). */
  serverFnBase?: string;
  /** Specifiers that must never reach the client bundle. */
  serverOnlySpecifiers?: readonly string[];
  /** App module replacing the generic `next-intl/server` shim. */
  intlServer?: string;
  /**
   * The app's next-intl request config (aliased as `next-intl/config`, as
   * next-intl's plugin does). Defaults to `./src/i18n/request.ts` when present.
   */
  intlRequestConfig?: string | false;
  /** Swap nuqs' Next App Router adapter for its TanStack Router one (default `true`). */
  nuqsAdapter?: boolean;
  /** Resolved `next/og` replacement, e.g. `@cloudflare/pages-plugin-vercel-og/api`. */
  og?: string;
  /**
   * Render `@tuturuuu/vercel`'s Analytics and Speed Insights as nothing:
   * Vercel serves their scripts only on its own hosting (default `true`
   * unless `shims` is explicit).
   */
  inertVercel?: boolean;
  /** Alias `server-only` to Start's server-only marker (default `true`). */
  serverOnly?: boolean;
  /**
   * RSC mode for the generic page adapter: enables Start's RSC environment
   * and leaves `next/navigation`, `next-intl` and `next-intl/navigation` to
   * `startBridgeRscPlugin` (`./vite/rsc`), which resolves them per environment.
   */
  rsc?: boolean;
}

/** Resolved per environment by `startBridgeRscPlugin` in RSC mode. */
export const RSC_PLUGIN_SHIMS = new Set<string>([
  'next/navigation',
  'next-intl',
  'next-intl/navigation',
]);

export interface StartBridgeAlias {
  find: RegExp | string;
  replacement: string;
}

const own = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

function escapeSpecifier(specifier: string) {
  return specifier.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
}

export function startBridgeAliases(
  options: Pick<
    StartBridgePresetOptions,
    | 'appRoot'
    | 'navigation'
    | 'shims'
    | 'aliases'
    | 'srcAlias'
    | 'intlServer'
    | 'intlRequestConfig'
    | 'nuqsAdapter'
    | 'og'
    | 'inertVercel'
    | 'serverOnly'
    | 'rsc'
  >
): StartBridgeAlias[] {
  const shims = options.shims ?? (Object.keys(NEXT_SHIMS) as NextShim[]);
  const document = options.navigation === 'document';
  const alias: StartBridgeAlias[] = Object.entries(options.aliases ?? {}).map(
    ([find, replacement]) => ({
      find: new RegExp(`^${escapeSpecifier(find)}$`, 'u'),
      replacement,
    })
  );
  for (const shim of shims) {
    if (shim === 'next-intl/server' && options.intlServer) continue;
    if (options.rsc && RSC_PLUGIN_SHIMS.has(shim)) continue;
    const target =
      document && (shim === 'next/navigation' || shim === 'next/link')
        ? 'next/navigation-document.tsx'
        : NEXT_SHIMS[shim];
    // `next/*` is also reached as `next/<module>.js` from compiled packages.
    const suffix = shim.startsWith('next/') ? '(?:\\.js)?' : '';
    alias.push({
      find: new RegExp(`^${escapeSpecifier(shim)}${suffix}$`, 'u'),
      replacement: own(target),
    });
  }
  const exact = (find: string, replacement: string) =>
    alias.push({
      find: new RegExp(`^${escapeSpecifier(find)}$`, 'u'),
      replacement,
    });
  if (options.intlServer)
    exact(
      'next-intl/server',
      fileURLToPath(new URL(options.intlServer, options.appRoot))
    );
  const genericIntlServer =
    shims.includes('next-intl/server') && !options.intlServer;
  const requestConfig =
    options.intlRequestConfig === false || !genericIntlServer
      ? null
      : fileURLToPath(
          new URL(
            options.intlRequestConfig ?? './src/i18n/request.ts',
            options.appRoot
          )
        );
  if (requestConfig && (options.intlRequestConfig || existsSync(requestConfig)))
    exact('next-intl/config', requestConfig);
  if (options.nuqsAdapter ?? !options.shims)
    exact('nuqs/adapters/next/app', 'nuqs/adapters/tanstack-router');
  if (options.og) exact('next/og', options.og);
  if (options.inertVercel ?? !options.shims)
    exact('@tuturuuu/vercel', own('next/vercel.tsx'));
  if (options.serverOnly ?? !options.shims)
    exact('server-only', '@tanstack/react-start/server-only');
  if (options.srcAlias !== false)
    alias.push({
      find: '@/',
      replacement: fileURLToPath(new URL('./src/', options.appRoot)),
    });
  return alias;
}

/** Build-time values of the basePath contract (see `createBasePath`). */
export interface PresetBasePath {
  basePath: string;
  app: string;
  isRoot: boolean;
  assetBase: string;
  serverFnBase: string;
  routerBasepath: string;
}

export function presetBasePath(
  app: string,
  input: string | undefined
): PresetBasePath {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(app))
    throw new Error(`Invalid app id: ${app}`);
  const basePath = (input ?? '').trim().replace(/\/+$/u, '');
  if (
    basePath &&
    !/^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/u.test(basePath)
  )
    throw new Error(`Invalid basePath: ${input}`);
  return {
    basePath,
    app,
    isRoot: basePath === '',
    assetBase: `${basePath}/`,
    serverFnBase: `${basePath}/_serverFn`,
    routerBasepath: basePath || '/',
  };
}

export interface StartBridgePreset {
  basePath: PresetBasePath;
  /** Vite `base`. */
  base: string;
  alias: StartBridgeAlias[];
  /** Shared `define` (both environments). */
  define: Record<string, string>;
  /**
   * Vite `experimental`: JS-referenced asset URLs read the runtime app base
   * (request context on the server, the document head script in the browser);
   * CSS-referenced URLs stay relative to their stylesheet. One artifact then
   * serves both the subdomain root and the apex mount.
   */
  experimental: {
    renderBuiltUrl: (
      filename: string,
      context: { hostType: 'js' | 'css' | 'html' }
    ) => { runtime: string } | { relative: true } | undefined;
  };
  /** Client `define`: `process.env` limited to `NEXT_PUBLIC_*` + NODE_ENV. */
  clientDefine: (command: 'build' | 'serve') => Record<string, string>;
  /** Options for `tanstackStart(...)`. */
  tanstackStart: {
    start: { entry: string };
    router: {
      enableRouteGeneration: true;
      routesDirectory: string;
      generatedRouteTree: string;
      routeTreeFileHeader: string[];
      disableTypes: false;
    };
    serverFns: { base: string };
    rsc?: { enabled: true };
    importProtection: {
      behavior: 'error';
      client: { specifiers: string[]; files: RegExp[] };
    };
  };
}

export function startBridgePreset(
  options: StartBridgePresetOptions,
  env: Record<string, string | undefined> = process.env
): StartBridgePreset {
  const basePath = presetBasePath(
    options.app,
    options.basePath ?? env.TUTURUUU_BASE_PATH
  );
  return {
    basePath,
    base: basePath.assetBase,
    alias: startBridgeAliases(options),
    experimental: {
      renderBuiltUrl: (filename, { hostType }) => {
        if (hostType === 'css') return { relative: true };
        if (hostType !== 'js') return undefined;
        const global = 'globalThis.__tuturuuuAppBase';
        return {
          runtime: `((typeof ${global}==='function'?${global}():${global})??${JSON.stringify(basePath.basePath)})+${JSON.stringify(`/${filename}`)}`,
        };
      },
    },
    define: {
      'import.meta.env.VITE_TUTURUUU_BASE_PATH': JSON.stringify(
        basePath.basePath
      ),
    },
    clientDefine: (command) => ({
      'process.env': JSON.stringify({
        ...Object.fromEntries(
          Object.entries(env).filter(([name]) =>
            name.startsWith('NEXT_PUBLIC_')
          )
        ),
        NODE_ENV:
          env.NODE_ENV ?? (command === 'build' ? 'production' : 'development'),
      }),
    }),
    tanstackStart: {
      start: { entry: './start.ts' },
      router: {
        enableRouteGeneration: true,
        routesDirectory: 'routes',
        generatedRouteTree: 'routeTree.gen.ts',
        routeTreeFileHeader: [],
        disableTypes: false,
      },
      serverFns: {
        base: `${basePath.basePath}${options.serverFnBase ?? '/_serverFn'}`,
      },
      ...(options.rsc ? { rsc: { enabled: true as const } } : {}),
      importProtection: {
        behavior: 'error',
        client: {
          specifiers: [
            'node:async_hooks',
            ...(options.serverOnlySpecifiers ?? []),
          ],
          files: [/\.server\.[cm]?[jt]sx?$/u],
        },
      },
    },
  };
}
