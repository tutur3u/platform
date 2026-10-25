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
  'next-intl': 'intl/use-intl.tsx',
  '@opennextjs/cloudflare': 'next/cloudflare-context.ts',
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
}

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
    'appRoot' | 'navigation' | 'shims' | 'aliases' | 'srcAlias'
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
    const target =
      document && (shim === 'next/navigation' || shim === 'next/link')
        ? 'next/navigation-document.tsx'
        : NEXT_SHIMS[shim];
    alias.push({
      find: new RegExp(`^${escapeSpecifier(shim)}$`, 'u'),
      replacement: own(target),
    });
  }
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
