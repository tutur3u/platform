import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { BASE_URL, TTR_URL } from '../constants/common';

export const DEFAULT_CALENDAR_PATH = '/personal';

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
