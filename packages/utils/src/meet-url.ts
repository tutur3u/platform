import {
  getAppProductionBaseUrl,
  joinAppUrl,
  ONE_ORIGIN_APP_BASE_PATHS,
  SHARED_APP_ORIGIN,
} from './app-mounts';

export const MEET_CANONICAL_ORIGIN = SHARED_APP_ORIGIN;
export const MEET_BASE_PATH = ONE_ORIGIN_APP_BASE_PATHS.meet;
export const MEET_LEGACY_ORIGIN = 'https://meet.tuturuuu.com';

export function meetPathForRequest(path: string, requestUrl: string | URL) {
  const url = new URL(requestUrl);
  return url.origin === MEET_CANONICAL_ORIGIN &&
    (url.pathname === MEET_BASE_PATH ||
      url.pathname.startsWith(`${MEET_BASE_PATH}/`))
    ? `${MEET_BASE_PATH}${path}`
    : path;
}

export function meetBrowserPath(path: string) {
  const browserLocation: unknown = Reflect.get(globalThis, 'location');
  if (
    !browserLocation ||
    typeof browserLocation !== 'object' ||
    !('href' in browserLocation) ||
    typeof browserLocation.href !== 'string'
  ) {
    return path;
  }

  return meetPathForRequest(path, browserLocation.href);
}

/** Build a public Meet link from an app-relative pathname, query or fragment. */
export function meetPublicUrl(path = '/') {
  return joinAppUrl(getAppProductionBaseUrl('meet', MEET_LEGACY_ORIGIN), path);
}

/**
 * Canonical public Meet URL for SEO, link previews and sharing. Always the
 * shared-origin mount (`https://tuturuuu.com/meet/...`), whatever mounts are
 * active, so metadata never advertises the legacy subdomain.
 */
export function meetCanonicalUrl(path = '/') {
  return joinAppUrl(`${MEET_CANONICAL_ORIGIN}${MEET_BASE_PATH}`, path);
}
