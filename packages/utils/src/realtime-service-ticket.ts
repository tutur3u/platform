import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Service tickets minted by the Meet realtime Worker for its platform
 * callbacks. The API proxy otherwise treats every bearer token as a Supabase
 * access token and answers 401 before the route can verify the ticket, so a
 * verified ticket on exactly its own route is a trusted service request.
 *
 * Bounds: POST only; the route, the ticket audience and the ticket kind must
 * match one of the pairs below; the ticket must be unexpired. The route
 * verifies the same ticket again (and its topic, ids and version), so this only
 * exempts the proxy's session and anonymous-scanner checks. A ticket can be
 * replayed within its lifetime (30 s); the route's own checks decide the
 * outcome of a replay, and tickets are not single-use.
 */
const SERVICE_ROUTES: Record<
  string,
  { audience: string; kinds: ReadonlySet<string> }
> = {
  '/api/v1/realtime/documents/checkpoint': {
    audience: 'tuturuuu.channels',
    kinds: new Set(['document-checkpoint']),
  },
  '/api/v1/realtime/programming/checkpoint': {
    audience: 'tuturuuu.collaboration',
    kinds: new Set(['checkpoint', 'runner-files']),
  },
};
export const REALTIME_SERVICE_TICKET_ROUTES = new Set(
  Object.keys(SERVICE_ROUTES)
);

function decodeSignedPayload(
  token: string,
  secret: string
): Record<string, unknown> | null {
  if (token.length > 16384) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (
    !encoded ||
    !signature ||
    !/^[A-Za-z0-9_-]+$/.test(encoded) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  )
    return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

/** Verify a ticket for one exact route; null unless signature, audience, kind and expiry all match. */
export function verifyRealtimeServiceTicket(
  pathname: string,
  token: string | null | undefined,
  secret: string | undefined,
  now = Date.now()
): { kind: string; exp: number } | null {
  const route = SERVICE_ROUTES[pathname];
  if (!route || !token || !secret?.trim()) return null;
  const payload = decodeSignedPayload(token, secret.trim());
  if (!payload) return null;
  const { aud, kind, exp } = payload;
  if (
    aud !== route.audience ||
    typeof kind !== 'string' ||
    !route.kinds.has(kind) ||
    typeof exp !== 'number' ||
    !Number.isFinite(exp) ||
    exp * 1000 <= now
  )
    return null;
  return { kind, exp };
}

export function isTrustedRealtimeServiceRequest(
  pathname: string,
  headers: Headers,
  method: string | undefined,
  secret = process.env.MEET_REALTIME_TOKEN_SECRET
) {
  if (method !== 'POST') return false;
  const token = headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  return verifyRealtimeServiceTicket(pathname, token, secret) !== null;
}
