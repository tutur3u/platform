import {
  isMountedForbiddenCookieName,
  keepFirstLocaleCookie,
} from '@tuturuuu/start-bridge/start/handler';

/**
 * The `Cookie` header Meet receives under `tuturuuu.com/meet`: no cookie a
 * mounted app may not read, and only Meet's own `Path=/meet` locale copy, so
 * Meet's proxy renders the language chosen in Meet rather than Web's.
 */
export function mountedMeetCookieHeader(header: string): string {
  return (
    keepFirstLocaleCookie(
      header
        .split(';')
        .filter(
          (pair) =>
            !isMountedForbiddenCookieName(pair.split('=', 1)[0]?.trim() ?? '')
        )
        .join(';')
    ) ?? ''
  );
}
