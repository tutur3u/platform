/// <reference path="./import-meta-env.d.ts" />
import { prefixBase, trimTrailingSlashes } from './base-path';
import { fromNextSourcePattern, matchRoute } from './route-match';

/**
 * The runtime app base for app code, SSR and the browser alike. On the
 * server the bridge request context supplies it; in the browser the document
 * head script (`appBaseHeadScript`) does. Without either, the build-time
 * `VITE_TUTURUUU_BASE_PATH` default applies (empty at the root).
 *
 * This module has no Node or framework imports, so packages such as
 * `@tuturuuu/internal-api` and client components may use it.
 */
export const APP_BASE_GLOBAL = '__tuturuuuAppBase';

type Resolver = () => string | undefined;
type BaseGlobal = { [APP_BASE_GLOBAL]?: Resolver | string };

/**
 * Server hook: a request context registers a per-request resolver. Several
 * contexts can coexist in one Worker (an app's own request store and the
 * bridge store), so a resolver that has no answer for the current request
 * defers to the one installed before it instead of replacing it.
 */
export function installAppBaseResolver(resolver: Resolver) {
  const global = globalThis as BaseGlobal;
  const previous = global[APP_BASE_GLOBAL];
  const fallback = typeof previous === 'function' ? previous : undefined;
  global[APP_BASE_GLOBAL] = fallback
    ? () => resolver() ?? fallback()
    : resolver;
}

function buildTimeBase(): string {
  const value = import.meta.env?.VITE_TUTURUUU_BASE_PATH;
  return typeof value === 'string' ? trimTrailingSlashes(value) : '';
}

export function runtimeAppBase(): string {
  const hook = (globalThis as BaseGlobal)[APP_BASE_GLOBAL];
  const value = typeof hook === 'function' ? hook() : hook;
  return typeof value === 'string' ? value : buildTimeBase();
}

/** Prefixes a path-absolute href with the app base (identity at the root). */
export function withAppBase(href: string, basePath = runtimeAppBase()): string {
  return prefixBase(href, basePath);
}

/**
 * The app-relative pathname `next/navigation` reports under a basePath.
 * Start's client hydration resets the router to its build-time basepath, so
 * on a runtime mount (`/contacts`) the browser router reads the full path
 * while the server router, created with the request base, reads it relative.
 * Strip the base only when the router does not already apply it, and only at
 * a segment boundary.
 */
export function appRelativePathname(
  pathname: string,
  routerBasepath: string | undefined,
  basePath = runtimeAppBase()
): string {
  const base = trimTrailingSlashes(basePath);
  if (!base || trimTrailingSlashes(routerBasepath ?? '') === base)
    return pathname;
  if (pathname === base) return '/';
  return pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : pathname;
}

/** App path for fetches and links, e.g. `appPath('/api/meet-call/x')`. */
export function appPath(path: string): string {
  return withAppBase(path);
}

/**
 * Absolute app URL for share links, downloads, workers and auth return
 * URLs. Pass `origin` on the server; the browser defaults to its location.
 */
export function appUrl(path: string, origin?: string | URL): string {
  const base =
    origin ?? (typeof location === 'undefined' ? undefined : location.origin);
  if (!base) throw new Error('appUrl needs an origin outside the browser');
  return new URL(appPath(path), base).toString();
}

/**
 * Browser and server `/api` routing for an app mounted under a base. App-owned
 * endpoints (the generated `appApiPatterns`) gain the app base; everything
 * else, and anything in `centralFirst`, stays a relative Web `/api` path —
 * on the apex that already reaches Web, and on a subdomain the app Worker
 * forwards it to the central API.
 */
export function createApiPath(
  appPatterns: readonly string[],
  centralFirst: readonly string[] = []
) {
  const central = centralFirst.map(fromNextSourcePattern);
  const matches = (patterns: readonly string[], path: string) =>
    patterns.some((pattern) => {
      try {
        return matchRoute(pattern, path) !== null;
      } catch {
        return false;
      }
    });
  return function apiPath(path: string): string {
    const end = path.search(/[?#]/u);
    const pathname = end === -1 ? path : path.slice(0, end);
    if (matches(central, pathname) || !matches(appPatterns, pathname))
      return path;
    return appPath(path);
  };
}
