import { createHmac, timingSafeEqual } from 'node:crypto';
/** Shared compact token wire format. Callers must validate their own audience/schema. */
export function signRealtimePayload(payload: unknown, secret?: string) {
  if (!secret?.trim())
    throw new Error('Realtime token signing requires a secret');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret.trim()).update(encoded).digest('base64url')}`;
}
export function verifyRealtimePayload(
  token: string,
  secret?: string
): unknown | null {
  if (!secret?.trim())
    throw new Error('Realtime token signing requires a secret');
  if (token.length > 16384) return null;
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
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
