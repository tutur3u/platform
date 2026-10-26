import type { NextRequest } from 'next/server';

export const GUARD_REASON_HEADER = 'X-Tuturuuu-Guard-Reason';
export const GUARD_REQUEST_ID_HEADER = 'X-Tuturuuu-Guard-Request-Id';

export type GuardRejectionReason =
  | 'offline-download-inactive'
  | 'offline-download-unavailable'
  | 'offline-download-rate-limited'
  | 'offline-download-authentication-required'
  | 'offline-download-challenge-required'
  | 'auth-assurance-unavailable'
  | 'auth-assurance-required'
  | 'auth-assurance-unauthenticated'
  | 'app-session-refresh-unavailable'
  | 'app-session-unauthenticated'
  | 'proxy-ip-blocked'
  | 'proxy-rate-limited'
  | 'proxy-payload-too-large'
  | 'proxy-content-rejected';

// Only fixed templates enter logs; no path segments or query values are copied.
function routeTemplate(url: string) {
  const path = new URL(url).pathname;
  if (path.startsWith('/api/v1/mobile-calendar/'))
    return '/api/v1/mobile-calendar/:path*';
  if (/^\/api\/(?:v1\/)?workspaces(?:\/|$)/u.test(path))
    return '/api/:version?/workspaces/:path*';
  return path.startsWith('/api/') ? '/api/:path*' : '/:path*';
}

/** Diagnostics are independent of guard policy and never inspect credentials. */
export function guardRejection<T extends Response | null | undefined>(
  request: Pick<NextRequest, 'url'>,
  response: T,
  reason: GuardRejectionReason
): T {
  if (!response || response.status < 400) return response;
  response.headers.set(GUARD_REASON_HEADER, reason);
  // Generate locally rather than copying an untrusted request header into logs.
  const requestId = crypto.randomUUID();
  response.headers.set(GUARD_REQUEST_ID_HEADER, requestId);
  const exposed = new Set(
    (response.headers.get('Access-Control-Expose-Headers') ?? '')
      .split(',')
      .map((header) => header.trim())
      .filter(Boolean)
  );
  exposed.add(GUARD_REASON_HEADER);
  exposed.add(GUARD_REQUEST_ID_HEADER);
  response.headers.set(
    'Access-Control-Expose-Headers',
    [...exposed].join(', ')
  );
  console.warn('Guard rejected request', {
    reason,
    route: routeTemplate(request.url),
    requestId,
  });
  return response;
}
