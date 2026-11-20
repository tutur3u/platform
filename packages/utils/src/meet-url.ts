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
  return typeof location === 'undefined'
    ? path
    : meetPathForRequest(path, location.href);
}

/** Build a public Meet link from an app-relative pathname, query or fragment. */
export function meetPublicUrl(path = '/') {
  return joinAppUrl(getAppProductionBaseUrl('meet', MEET_LEGACY_ORIGIN), path);
}
