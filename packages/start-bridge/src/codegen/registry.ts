import { posix } from 'node:path';
import { HTTP_METHODS, type HttpMethod } from '../core/endpoints';

/**
 * Pure route-registry generation for App Router source compiled by the
 * bridge. The CLI supplies the file list and writes or checks the output;
 * every `route.*`/`page.*` must be generated, owned by named native code, or
 * explicitly ignored with a reason, otherwise the check fails.
 */
export interface RegistryConfig {
  /**
   * App Router directory relative to the app root (default `src/app`). Use
   * `null` for an app with no App Router source; a missing directory fails.
   */
  appDir?: string | null;
  /** Segments removed from patterns, with the params they imply. */
  stripSegments?: Record<string, Record<string, string>>;
  /**
   * Generated endpoint registry; `null` means no route may be unowned.
   * `patternsOut` also emits a client-safe `appApiPatterns` list for
   * `createApiPath` (no route modules imported).
   */
  api?: {
    out: string;
    patternsOut?: string;
    /**
     * Import each route only when it is first requested
     * (`lazyRouteModule`), so one route's dependencies cannot fail the whole
     * Worker at startup. Needs the route sources (`readSource`); a route
     * whose methods cannot be read statically (`export *`) stays eager.
     */
    lazy?: boolean;
    /**
     * App-owned API patterns the app forwards rather than handles (e.g.
     * Storefront's `/api/v1/inventory/[...path]`, which its Worker sends to
     * Inventory through `apiOrigin`). Merged into `appApiPatterns`, so the
     * shared app-base resolver mounts them like local routes.
     */
    forwarded?: readonly string[];
  } | null;
  /** Generated page manifest; `null` means no page may be unowned. */
  pages?: { out: string } | null;
  /** Route file (relative to appDir) to the native file that owns it. */
  owned?: Record<string, string>;
  /** Route file (relative to appDir) to the reason it is not served. */
  ignored?: Record<string, string>;
}

export interface RouteFile {
  /** Relative to appDir, POSIX separators. */
  file: string;
  kind: 'route' | 'page';
  pattern: string;
  defaults: Record<string, string>;
}

export interface RegistryPlan {
  routes: RouteFile[];
  generated: { path: string; content: string }[];
  errors: string[];
}

const ROUTE_FILE = /(?:^|\/)(route|page)\.(?:[cm]?[jt]sx?)$/u;

export function classifyRouteFile(
  file: string,
  stripSegments: RegistryConfig['stripSegments'] = {}
): RouteFile | { error: string } | null {
  const match = ROUTE_FILE.exec(file);
  if (!match) return null;
  const kind = match[1] as RouteFile['kind'];
  const segments = file.split('/').slice(0, -1);
  const kept: string[] = [];
  const defaults: Record<string, string> = {};
  for (const segment of segments) {
    if (segment.startsWith('@') || /^\(\.{1,3}\)/u.test(segment))
      return { error: `${file}: parallel/intercepting routes are unsupported` };
    if (/^\(.+\)$/u.test(segment)) continue;
    const stripped = stripSegments[segment];
    if (stripped) {
      Object.assign(defaults, stripped);
      continue;
    }
    if (segment.startsWith('_'))
      return { error: `${file}: private folders cannot contain routes` };
    kept.push(segment);
  }
  return { file, kind, pattern: `/${kept.join('/')}`, defaults };
}

/** A pattern with dynamic segment names erased: `/a/[id]` -> `/a/[]`. */
export function routeShape(pattern: string) {
  return pattern
    .split('/')
    .map((segment) =>
      segment.startsWith('[[...')
        ? '[[...]]'
        : segment.startsWith('[...')
          ? '[...]'
          : segment.startsWith('[')
            ? '[]'
            : segment
    )
    .join('/');
}

function importPath(fromFile: string, toFile: string) {
  const relative = posix.relative(posix.dirname(fromFile), toFile);
  const withoutExtension = relative.replace(/\.[cm]?[jt]sx?$/u, '');
  return withoutExtension.startsWith('.')
    ? withoutExtension
    : `./${withoutExtension}`;
}

/**
 * The HTTP methods a route module exports, read statically; `null` when a
 * re-export (`export *`) hides them. Comments are ignored.
 */
export function exportedMethods(source: string): HttpMethod[] | null {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
  if (/\bexport\s*\*\s*from\b/u.test(code)) return null;
  const names = new Set<string>();
  for (const match of code.matchAll(
    /\bexport\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gu
  ))
    names.add(match[1] as string);
  for (const match of code.matchAll(
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gu
  ))
    names.add(match[1] as string);
  // `export const { GET, POST } = handlers` and `export { a as GET }`.
  for (const match of code.matchAll(
    /\bexport\s+(?:(?:const|let|var)\s*\{([^}]*)\}\s*=|\{([^}]*)\})/gu
  ))
    for (const part of (match[1] ?? match[2] ?? '').split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+|\s*:\s*/u)
        .at(-1)
        ?.replace(/^type\s+/u, '');
      if (name) names.add(name);
    }
  return HTTP_METHODS.filter((method) => names.has(method));
}

function literal(value: Record<string, string>) {
  const entries = Object.entries(value);
  if (entries.length === 0) return '';
  return `, defaults: { ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
}

const HEADER =
  '// Generated by @tuturuuu/start-bridge (start-bridge-routes generate). Do not edit.\n';

export function renderApiRegistry(
  out: string,
  appDir: string,
  routes: RouteFile[],
  /** Route file to its statically read methods, for lazy routes. */
  lazyMethods: ReadonlyMap<string, HttpMethod[]> = new Map()
) {
  const sorted = routes.toSorted((a, b) => a.file.localeCompare(b.file));
  const imports: string[] = [];
  const entries = sorted.map((route, index) => {
    const from = importPath(out, posix.join(appDir, route.file));
    const methods = lazyMethods.get(route.file);
    let module = `route${index}`;
    if (methods)
      module = `lazyRouteModule(() => import('${from}'), ${JSON.stringify(methods)})`;
    else imports.push(`import * as route${index} from '${from}';`);
    return `  { pattern: ${JSON.stringify(route.pattern)}, module: ${module}${literal(route.defaults)} },`;
  });
  const lazy = lazyMethods.size > 0;
  return `${HEADER}import {
  type BridgeEndpoint,
${lazy ? '  lazyRouteModule,\n' : ''}  sortEndpoints,
} from '@tuturuuu/start-bridge/endpoints';
${imports.map((line) => `${line}\n`).join('')}
export const endpoints: readonly BridgeEndpoint[] = sortEndpoints([
${entries.join('\n')}
]);
`;
}

function lazyRouteMethods(
  config: RegistryConfig,
  appDir: string,
  routes: RouteFile[],
  readSource: ((path: string) => string) | undefined
) {
  const methods = new Map<string, HttpMethod[]>();
  if (!config.api?.lazy || !readSource) return methods;
  for (const route of routes)
    if (route.kind === 'route') {
      const found = exportedMethods(readSource(posix.join(appDir, route.file)));
      if (found) methods.set(route.file, found);
    }
  return methods;
}

export function renderApiPatterns(
  routes: RouteFile[],
  forwarded: readonly string[] = []
) {
  const patterns = [
    ...new Set([...routes.map((route) => route.pattern), ...forwarded]),
  ].sort();
  return `${HEADER}export const appApiPatterns = [
${patterns.map((pattern) => `  ${JSON.stringify(pattern)},`).join('\n')}
] as const;
`;
}

export function renderPageManifest(appDir: string, pages: RouteFile[]) {
  const sorted = pages.toSorted((a, b) => a.file.localeCompare(b.file));
  const entries = sorted.map(
    (page) =>
      `  { pattern: ${JSON.stringify(page.pattern)}, file: ${JSON.stringify(posix.join(appDir, page.file))}${literal(page.defaults)} },`
  );
  return `${HEADER}import type { BridgePage } from '@tuturuuu/start-bridge/pages';

export const pages = [
${entries.join('\n')}
] as const satisfies readonly BridgePage[];

export type PagePattern = (typeof pages)[number]['pattern'];
`;
}

/**
 * Plans the registries for one app. `files` are relative to `appDir`;
 * `exists` answers for paths relative to the app root (owner files).
 */
export function planRegistries(
  config: RegistryConfig,
  files: readonly string[],
  exists: (appRelativePath: string) => boolean,
  /** App-relative source reader; required for `api.lazy`. */
  readSource?: (appRelativePath: string) => string
): RegistryPlan {
  const appDir = config.appDir ?? 'src/app';
  const owned = config.owned ?? {};
  const ignored = config.ignored ?? {};
  const errors: string[] = [];
  const routes: RouteFile[] = [];
  const seen = new Set<string>();
  for (const file of files.toSorted()) {
    const classified = classifyRouteFile(file, config.stripSegments);
    if (!classified) continue;
    seen.add(file);
    if ('error' in classified) {
      errors.push(classified.error);
      continue;
    }
    if (file in owned) {
      const owner = owned[file] ?? '';
      if (!owner || !exists(owner))
        errors.push(`${file}: owner ${owner || '(empty)'} does not exist`);
      continue;
    }
    if (file in ignored) {
      if (!ignored[file]?.trim())
        errors.push(`${file}: an ignored route needs a reason`);
      continue;
    }
    const target = classified.kind === 'route' ? config.api : config.pages;
    if (!target) {
      errors.push(
        `${posix.join(appDir, file)}: unregistered ${classified.kind}; generate a registry, or declare it in "owned"/"ignored"`
      );
      continue;
    }
    routes.push(classified);
  }
  for (const pattern of config.api?.forwarded ?? [])
    if (!/^\/api(?:\/|$)/u.test(pattern))
      errors.push(`api.forwarded: ${pattern} is not an /api pattern`);
  for (const file of [...Object.keys(owned), ...Object.keys(ignored)])
    if (!seen.has(file))
      errors.push(`${file}: declared in owned/ignored but no such route file`);
  // Next rejects two files resolving to one URL shape, whatever the dynamic
  // segment names (`[id]` vs `[slug]`) or file kind (page vs route).
  const byShape = new Map<string, RouteFile>();
  for (const route of routes) {
    const shape = routeShape(route.pattern);
    const previous = byShape.get(shape);
    if (previous)
      errors.push(
        previous.pattern === route.pattern && previous.kind === route.kind
          ? `${route.file}: ${route.kind} pattern ${route.pattern} duplicates ${previous.file}`
          : `${route.file}: ${route.kind} ${route.pattern} conflicts with ${previous.kind} ${previous.pattern} (${previous.file})`
      );
    else byShape.set(shape, route);
  }
  const generated: RegistryPlan['generated'] = [];
  if (config.api)
    generated.push({
      path: config.api.out,
      content: renderApiRegistry(
        config.api.out,
        appDir,
        routes.filter((route) => route.kind === 'route'),
        lazyRouteMethods(config, appDir, routes, readSource)
      ),
    });
  if (config.api?.patternsOut)
    generated.push({
      path: config.api.patternsOut,
      content: renderApiPatterns(
        routes.filter((route) => route.kind === 'route'),
        config.api.forwarded
      ),
    });
  if (config.pages)
    generated.push({
      path: config.pages.out,
      content: renderPageManifest(
        appDir,
        routes.filter((route) => route.kind === 'page')
      ),
    });
  return { routes, generated, errors };
}
