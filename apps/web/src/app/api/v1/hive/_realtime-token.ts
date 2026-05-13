import { createHmac, timingSafeEqual } from 'node:crypto';

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function getRealtimeSecret() {
  const secret =
    process.env.HIVE_REALTIME_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Hive realtime token signing requires HIVE_REALTIME_TOKEN_SECRET or the platform Supabase service secret in production'
    );
  }

  return 'hive-local-development-token-secret';
}

export function signHiveRealtimeToken(payload: Record<string, unknown>) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', getRealtimeSecret())
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyHiveRealtimeToken(token: string) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createHmac('sha256', getRealtimeSecret())
    .update(encodedPayload)
    .digest();
  const received = Buffer.from(
    signature.replace(/-/gu, '+').replace(/_/gu, '/'),
    'base64'
  );

  if (
    expected.byteLength !== received.byteLength ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  return JSON.parse(fromBase64Url(encodedPayload)) as Record<string, unknown>;
}
