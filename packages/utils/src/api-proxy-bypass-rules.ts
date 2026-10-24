import { DEV_MODE } from './constants';
import { isTrustedRealtimeServiceRequest } from './realtime-service-ticket';

export type TrustedProxyBypassRule = {
  matches: (pathname: string, headers: Headers) => boolean;
};

function hasBearerToken(headers: Headers, secrets: Array<string | undefined>) {
  const authHeader = headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  return secrets.some(
    (secret) => !!secret && authHeader === `Bearer ${secret}`
  );
}

function hasHeaderToken(
  headers: Headers,
  headerName: string,
  secrets: Array<string | undefined>
) {
  const headerValue = headers.get(headerName);
  if (!headerValue) {
    return false;
  }

  return secrets.some((secret) => !!secret && headerValue === secret);
}

/** Service callers the API proxy must not treat as anonymous or session-bound. */
export const DEFAULT_TRUSTED_BYPASS_RULES: TrustedProxyBypassRule[] = [
  {
    matches: (pathname, headers) =>
      (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) &&
      (hasBearerToken(headers, [
        process.env.CRON_SECRET,
        process.env.VERCEL_CRON_SECRET,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ]) ||
        hasHeaderToken(headers, 'x-cron-secret', [
          process.env.CRON_SECRET,
          process.env.VERCEL_CRON_SECRET,
        ]) ||
        hasHeaderToken(headers, 'x-vercel-cron-secret', [
          process.env.CRON_SECRET,
          process.env.VERCEL_CRON_SECRET,
        ])),
  },
  {
    matches: (pathname, headers) =>
      (pathname === '/api/v1/webhooks' ||
        pathname.startsWith('/api/v1/webhooks/')) &&
      !!process.env.SUPABASE_WEBHOOK_SECRET &&
      headers.get('x-webhook-secret') === process.env.SUPABASE_WEBHOOK_SECRET,
  },
  // Migration APIs: bypass rate limit in DEV_MODE (routes already return 403 in production)
  {
    matches: (pathname, _headers) =>
      pathname.startsWith('/api/v1/infrastructure/migrate/') && DEV_MODE,
  },
  // Meet realtime Worker callbacks carry an HMAC service ticket, not a
  // Supabase session; the route verifies the same ticket again.
  {
    matches: (pathname, headers) =>
      isTrustedRealtimeServiceRequest(pathname, headers),
  },
];
