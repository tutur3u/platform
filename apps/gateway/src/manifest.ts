import manifestJson from './manifest.json';

export type CacheClass = 'page' | 'static' | 'bypass';

export interface ManifestRoute {
  id: string;
  origin: string;
  cache: Exclude<CacheClass, 'bypass'>;
  /** Paths may carry a leading `/<locale>` segment. */
  localized: boolean;
  exact: string[];
  prefix: string[];
}

export interface Manifest {
  locales: string[];
  origins: Record<string, { env: string }>;
  default: { origin: string; cache: 'bypass' };
  routes: ManifestRoute[];
}

export interface RouteMatch {
  routeId: string;
  origin: string;
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
