import { prefixBase } from './base-path';

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

/** Server hook: the request context registers a per-request resolver. */
export function installAppBaseResolver(resolver: Resolver) {
  (globalThis as BaseGlobal)[APP_BASE_GLOBAL] = resolver;
}

function buildTimeBase(): string {
  const value = import.meta.env?.VITE_TUTURUUU_BASE_PATH;
  return typeof value === 'string' ? value.replace(/\/+$/u, '') : '';
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
