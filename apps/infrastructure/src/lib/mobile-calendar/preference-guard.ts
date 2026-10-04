const preferencePath =
  /^\/api\/v1\/mobile-calendar\/api\/v1\/(?:users\/calendar-settings|workspaces\/[a-zA-Z0-9_-]+\/calendar-settings)$/u;

export function isCalendarPreferenceRead(request: {
  method: string;
  nextUrl: { pathname: string };
}): boolean {
  return (
    request.method === 'GET' && preferencePath.test(request.nextUrl.pathname)
  );
}

/** Keep the same shared guard limits, auth, MFA and IP blocks, in a bounded
 * preferences bucket independent of event/account fan-out. */
export function calendarPreferenceGuardPrefix(request: {
  method: string;
  nextUrl: { pathname: string };
}): string {
  return isCalendarPreferenceRead(request)
    ? 'proxy:infra:calendar-preferences'
    : 'proxy:infra:api';
}

/** Fixed fields only: never log actor, workspace, IP, token, cookies or bodies. */
export function calendarPreferenceBlockDiagnostic(headers: Headers) {
  const field = (name: string) => {
    const value = headers.get(name);
    return value && /^[a-zA-Z0-9_-]{1,48}$/u.test(value) ? value : 'unknown';
  };
  return {
    reason: field('X-Proxy-Block-Reason'),
    policy: field('X-RateLimit-Policy'),
    callerClass: field('X-RateLimit-Caller-Class'),
    window: field('X-RateLimit-Window'),
  };
}
