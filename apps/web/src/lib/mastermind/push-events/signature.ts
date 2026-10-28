import { createHmac, timingSafeEqual } from 'node:crypto';

export const MASTERMIND_PUSH_SIGNATURE_HEADER = 'x-mm-signature';
export const MASTERMIND_PUSH_TIMESTAMP_HEADER = 'x-mm-timestamp';
export const MASTERMIND_PUSH_MAX_SKEW_SECONDS = 5 * 60;
export const MASTERMIND_PUSH_MIN_SECRET_LENGTH = 32;

const SIGNATURE = /^[0-9a-f]{64}$/;
const TIMESTAMP = /^[0-9]{1,12}$/;

export type MastermindPushSignatureResult =
  | 'ok'
  | 'unconfigured'
  | 'missing'
  | 'stale'
  | 'invalid';

/** Lowercase hex HMAC-SHA256 over `<unix seconds>.<raw body>`. */
export function signMastermindPushEvent(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
}

function matchesSecret(
  secret: string,
  timestamp: string,
  rawBody: string,
  actual: Buffer
) {
  const expected = Buffer.from(
    signMastermindPushEvent(secret, timestamp, rawBody),
    'hex'
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Secrets are trimmed. `nextSecret` is the rotation slot: while it is set, a
 * signature from either secret is accepted, and both must meet the minimum.
 */
export function verifyMastermindPushSignature(input: {
  secret: string | undefined;
  nextSecret?: string | undefined;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  nowMs?: number;
}): MastermindPushSignatureResult {
  const secret = input.secret?.trim();
  const nextSecret = input.nextSecret?.trim();
  if (!secret || secret.length < MASTERMIND_PUSH_MIN_SECRET_LENGTH)
    return 'unconfigured';
  if (nextSecret && nextSecret.length < MASTERMIND_PUSH_MIN_SECRET_LENGTH)
    return 'unconfigured';
  if (!input.signature || !input.timestamp) return 'missing';

  const signature = input.signature.trim();
  const timestamp = input.timestamp.trim();
  if (!SIGNATURE.test(signature) || !TIMESTAMP.test(timestamp))
    return 'invalid';

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (
    Math.abs(nowSeconds - Number(timestamp)) > MASTERMIND_PUSH_MAX_SKEW_SECONDS
  )
    return 'stale';

  const actual = Buffer.from(signature, 'hex');
  // Both secrets are always checked so timing does not reveal which matched.
  const primaryOk = matchesSecret(secret, timestamp, input.rawBody, actual);
  const nextOk = nextSecret
    ? matchesSecret(nextSecret, timestamp, input.rawBody, actual)
    : false;
  return primaryOk || nextOk ? 'ok' : 'invalid';
}
