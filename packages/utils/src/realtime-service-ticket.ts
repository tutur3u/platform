import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Service tickets minted by the Meet realtime Worker for its platform
 * callbacks. The API proxy otherwise treats every bearer token as a Supabase
 * access token and answers 401 before the route can verify the ticket, so a
 * verified ticket on exactly these routes is a trusted service request.
 * The route still verifies the ticket itself; this only exempts the proxy's
 * session and anonymous-scanner checks.
 */
export const REALTIME_SERVICE_TICKET_ROUTES = new Set([
  '/api/v1/realtime/documents/checkpoint',
  '/api/v1/realtime/programming/checkpoint',
]);
const SERVICE_KINDS = new Set([
  'document-checkpoint',
  'checkpoint',
  'runner-files',
]);
const AUDIENCES = new Set(['tuturuuu.channels', 'tuturuuu.collaboration']);

export function verifyRealtimeServiceTicket(
  token: string | null | undefined,
  secret: string | undefined,
  now = Date.now()
): { kind: string; exp: number } | null {
  if (!token || !secret?.trim() || token.length > 16384) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature || !/^[A-Za-z0-9_-]+$/.test(signature))
    return null;
  const expected = createHmac('sha256', secret.trim()).update(encoded).digest();
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
  if (!payload || typeof payload !== 'object') return null;
  const { aud, kind, exp } = payload as Record<string, unknown>;
  if (
    typeof aud !== 'string' ||
    !AUDIENCES.has(aud) ||
    typeof kind !== 'string' ||
    !SERVICE_KINDS.has(kind) ||
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
  secret = process.env.MEET_REALTIME_TOKEN_SECRET
) {
  if (!REALTIME_SERVICE_TICKET_ROUTES.has(pathname)) return false;
  const token = headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  return verifyRealtimeServiceTicket(token, secret) !== null;
}
