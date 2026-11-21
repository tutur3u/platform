import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { BASE_URL, TTR_URL } from '../constants/common';

export const DEFAULT_CALENDAR_PATH = '/personal';

/** Keep the next page on the mount and keep auth steps out of the return. */
export function calendarMountedDestination(
  rawNext: string | null | undefined,
  origin: string,
  basePath: string
) {
  const next = normalizeAuthRedirectPath(
    rawNext,
    origin,
    DEFAULT_CALENDAR_PATH
  );
  const { pathname } = new URL(next, origin);
  const relative =
    createBasePath({ app: 'calendar', basePath }).strip(pathname) ?? pathname;
  try {
    const segments = relative
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const first = segments[0];
    const page = first === 'en' || first === 'vi' ? segments[1] : first;
    return withAppBase(
      page === 'login' || page === 'verify-token'
        ? DEFAULT_CALENDAR_PATH
        : next,
      basePath
    );
  } catch {
    return withAppBase(DEFAULT_CALENDAR_PATH, basePath);
  }
}

/**
 * Central Web sign-in URL for a signed-out Calendar visitor.
 *
 * Mirrors the login page's handoff: the return target is the config-pinned
 * Calendar `BASE_URL` verifier (never request-header derived), and `next` is
 * reduced to a same-origin path against the `BASE_URL` origin, falling back to
 * the personal workspace. The URL never carries a handoff token.
 */
export function centralCalendarLoginUrl(rawNext: string | null | undefined) {
  const calendarOrigin = new URL(BASE_URL).origin;
  const nextPath = normalizeAuthRedirectPath(
    rawNext,
    calendarOrigin,
    DEFAULT_CALENDAR_PATH
  );

  const returnUrl = new URL('/verify-token', calendarOrigin);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  return loginUrl;
}
