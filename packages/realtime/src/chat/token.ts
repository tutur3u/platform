import { createHmac, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { chatRealtimeTokenPayloadSchema } from './index';

type ChatRealtimeTokenPayloadInput = z.input<
  typeof chatRealtimeTokenPayloadSchema
>;

const SECRET_MIN_LENGTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

function getSecret(secret?: string) {
  const resolvedSecret = secret?.trim();
  if (!resolvedSecret || resolvedSecret.length < SECRET_MIN_LENGTH) {
    throw new Error(
      `Chat realtime token signing requires a secret of at least ${SECRET_MIN_LENGTH} characters`
    );
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

export function signChatRealtimeToken(
  payload: ChatRealtimeTokenPayloadInput,
  secret?: string
) {
  const parsed = chatRealtimeTokenPayloadSchema.parse(payload);
  const encodedPayload = toBase64Url(JSON.stringify(parsed));
  const signature = createHmac('sha256', getSecret(secret))
    .update(encodedPayload)
    .digest();

  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyChatRealtimeToken(
  token: string,
  secret?: string,
  nowMs = Date.now()
) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (
    !encodedPayload ||
    !signature ||
    !BASE64URL.test(encodedPayload) ||
    !BASE64URL.test(signature)
  ) {
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
    const payload = chatRealtimeTokenPayloadSchema.safeParse(
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
