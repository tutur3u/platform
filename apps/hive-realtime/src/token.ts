import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const hiveRealtimeTokenPayloadSchema = z.object({
  exp: z.number().int().positive(),
  role: z.enum(['admin', 'member']),
  scopes: z.array(z.string()).default([]),
  serverId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type HiveRealtimeTokenPayload = z.infer<
  typeof hiveRealtimeTokenPayloadSchema
>;

function getSecret(secret = process.env.HIVE_REALTIME_TOKEN_SECRET) {
  if (secret?.trim()) return secret.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('HIVE_REALTIME_TOKEN_SECRET is required in production');
  }
  return 'hive-local-development-token-secret';
}

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64');
}

export function verifyHiveRealtimeToken(
  token: string,
  secret?: string,
  nowMs = Date.now()
) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) return null;

  const expected = createHmac('sha256', getSecret(secret))
    .update(encodedPayload)
    .digest();
  const received = fromBase64Url(signature);

  if (
    expected.byteLength !== received.byteLength ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  const payload = hiveRealtimeTokenPayloadSchema.safeParse(
    JSON.parse(fromBase64Url(encodedPayload).toString('utf8'))
  );

  if (!payload.success || payload.data.exp * 1000 <= nowMs) {
    return null;
  }

  return payload.data;
}
