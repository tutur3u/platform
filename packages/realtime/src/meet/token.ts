import { createHmac, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { meetRealtimeTokenPayloadSchema } from './index';

type MeetRealtimeTokenPayloadInput = z.input<
  typeof meetRealtimeTokenPayloadSchema
>;

function getSecret(secret?: string) {
  const resolvedSecret = secret?.trim();
  if (!resolvedSecret) {
    throw new Error('Meet realtime token signing requires a secret');
  }

  return resolvedSecret;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  return Buffer.from(normalized, 'base64');
}

export function signMeetRealtimeToken(
  payload: MeetRealtimeTokenPayloadInput,
  secret?: string
) {
  const parsed = meetRealtimeTokenPayloadSchema.parse(payload);
  const encodedPayload = toBase64Url(JSON.stringify(parsed));
  const signature = createHmac('sha256', getSecret(secret))
    .update(encodedPayload)
    .digest();

  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyMeetRealtimeToken(
  token: string,
  secret?: string,
  nowMs = Date.now()
) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

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

  try {
    const payload = meetRealtimeTokenPayloadSchema.safeParse(
      JSON.parse(fromBase64Url(encodedPayload).toString('utf8'))
    );

    if (!payload.success || payload.data.exp * 1000 <= nowMs) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}
