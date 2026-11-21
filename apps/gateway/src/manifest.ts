import manifestJson from './manifest.json';

export type CacheClass = 'page' | 'static' | 'bypass';

export interface ManifestRoute {
  id: string;
  origin: string;
  /** Page group that a deployment flag can move to `flagOrigin`. */
  group?: string;
  /** Origin that serves the group while its flag is on. */
  flagOrigin?: string;
  cache: Exclude<CacheClass, 'bypass'>;
  /** Paths may carry a leading `/<locale>` segment. */
  localized: boolean;
  exact: string[];
  prefix: string[];
}

/**
 * A route family of apps/web built as its own Worker and reached through the
 * service binding `binding`. Matching is method-agnostic.
 */
export interface WebFamily {
  id: string;
  /** Service binding name, `WEB_FAMILY_<ID>`. */
  binding: string;
  /** Paths may carry a leading `/<locale>` segment. */
  localized: boolean;
  /** Client asset prefix (`/_f/<id>`) stripped before the family sees it; null for API families. */
  assetPrefix: string | null;
  exact: string[];
  /** Raw string prefixes; each ends with `/`. */
  prefix: string[];
  /** Path subtrees (the path itself and everything below it) left to the fallback family. */
  exclude: string[];
}

export interface WebFamilies {
  /** Path subtrees that never reach any family, whatever the flags say. */
  deny: string[];
  families: WebFamily[];
}

export interface Manifest {
  locales: string[];
  /** HTTP origins by name; Web (the default) has no `env`: families serve it. */
  origins: Record<string, { env?: string }>;
  default: { origin: string; cache: 'bypass' };
  routes: ManifestRoute[];
  webFamilies?: WebFamilies;
}

export interface RouteMatch {
  routeId: string;
  origin: string;
  group?: string;
  flagOrigin?: string;
  cache: CacheClass;
  /** Path with any locale prefix removed; `/` for a bare locale. */
  pathname: string;
  /** Locale taken from the path prefix, when present. */
  locale: string | null;
}

export const manifest = manifestJson as Manifest;

export function splitLocale(pathname: string, locales: string[]) {
  const [, first = '', ...rest] = pathname.split('/');
  if (!locales.includes(first)) return { locale: null, pathname };
  return { locale: first, pathname: `/${rest.join('/')}` };
}

function matchesRoute(route: ManifestRoute, pathname: string) {
  return (
    route.exact.includes(pathname) ||
    route.prefix.some((prefix) => pathname.startsWith(prefix))
  );
}

export function matchRoute(
  pathname: string,
  source: Manifest = manifest
): RouteMatch {
  const split = splitLocale(pathname, source.locales);
  for (const route of source.routes) {
    if (matchesRoute(route, pathname)) {
      return {
        routeId: route.id,
        origin: route.origin,
        group: route.group,
        flagOrigin: route.flagOrigin,
        cache: route.cache,
        pathname,
        locale: null,
      };
    }
    if (
      route.localized &&
      split.locale &&
      matchesRoute(route, split.pathname)
    ) {
      return {
        routeId: route.id,
        origin: route.origin,
        group: route.group,
        flagOrigin: route.flagOrigin,
        cache: route.cache,
        pathname: split.pathname,
        locale: split.locale,
      };
    }
  }
  return {
    routeId: 'default',
    origin: source.default.origin,
    cache: source.default.cache,
    pathname,
    locale: split.locale,
  };
}
