import { createHmac, timingSafeEqual } from 'node:crypto';
import { type LiveSessionClaims, liveSessionClaimsSchema } from './contracts';

export function signLiveSession(claims: LiveSessionClaims, secret: string) {
  if (!secret) throw new Error('Live signing is not configured');
  const payload = Buffer.from(
    JSON.stringify(liveSessionClaimsSchema.parse(claims))
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`meet-live:${payload}`).digest('base64url')}`;
}
export function verifyLiveSession(
  token: string,
  secret: string,
  now = Date.now()
): LiveSessionClaims | null {
  if (!secret || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret)
    .update(`meet-live:${payload}`)
    .digest();
  const received = Buffer.from(signature, 'base64url');
  if (
    received.length !== expected.length ||
    !timingSafeEqual(expected, received)
  )
    return null;
  try {
    const parsed = liveSessionClaimsSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString())
    );
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch {
    return null;
  }
}
