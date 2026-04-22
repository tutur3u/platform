import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SEPAY_ENDPOINT_TOKEN_PREFIX = 'spwh_';
export const SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH = 12;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateSepayEndpointToken(): {
  token: string;
  prefix: string;
} {
  const token = `${SEPAY_ENDPOINT_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
  const prefix = token.slice(0, SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH);
  return { token, prefix };
}

export function extractSepayEndpointTokenPrefix(token: string): string | null {
  const normalizedToken = token.trim();

  if (
    !normalizedToken.startsWith(SEPAY_ENDPOINT_TOKEN_PREFIX) ||
    normalizedToken.length < SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH
  ) {
    return null;
  }

  return normalizedToken.slice(0, SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH);
}

export function extractAuthorizationSecret(
  authorizationHeader: string | null
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const trimmed = authorizationHeader.trim();
  if (!trimmed) {
    return null;
  }

  const prefixedSecretMatch = /^(?:bearer|token|apikey)\s+(.+)$/i.exec(trimmed);
  const secret = prefixedSecretMatch?.[1] ?? trimmed;
  const normalizedSecret = secret.trim();

  return normalizedSecret.length > 0 ? normalizedSecret : null;
}

export function getSepayWebhookAuthSecret(): string | null {
  return (
    process.env.SEPAY_WEBHOOK_API_KEY ??
    process.env.SEPAY_WEBHOOK_SECRET ??
    null
  );
}

export function isValidSepayWebhookAuthorization(
  authorizationHeader: string | null
): boolean {
  const expectedSecret = getSepayWebhookAuthSecret();

  if (!expectedSecret) {
    return false;
  }

  const providedSecret = extractAuthorizationSecret(authorizationHeader);
  if (!providedSecret) {
    return false;
  }

  return safeEqual(providedSecret, expectedSecret);
}
