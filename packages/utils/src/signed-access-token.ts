import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerTokenSecretCandidates } from './app-coordination-token';

/**
 * Short-lived, purpose-bound access tokens signed with the server token secret.
 *
 * Wire format: `sat1.<base64url JSON claims>.<base64url HMAC-SHA256>`.
 * Every purpose signs with its own derived key, so a token minted for one
 * purpose (for example a Meet guest session) never verifies for another.
 */

const TOKEN_VERSION = 'sat1';
const MAX_TOKEN_LENGTH = 2048;
const PURPOSE_PATTERN = /^[a-z0-9][a-z0-9:-]{1,63}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export type SignedAccessTokenClaims = Record<string, unknown> & {
  exp: number;
  iat: number;
  pur: string;
};

export interface SignedAccessTokenOptions {
  now?: Date;
  /** Overrides the environment secret; intended for tests. */
  secret?: string;
}

function assertPurpose(purpose: string) {
  if (!PURPOSE_PATTERN.test(purpose)) {
    throw new Error('Invalid signed access token purpose');
  }
}

function derivePurposeKey(secret: string, purpose: string) {
  return createHmac('sha256', secret)
    .update(`tuturuuu:signed-access-token:${purpose}`)
    .digest();
}

function sign(content: string, secret: string, purpose: string) {
  return createHmac('sha256', derivePurposeKey(secret, purpose))
    .update(content)
    .digest();
}

export function isSignedAccessToken(token: unknown): token is string {
  return typeof token === 'string' && token.startsWith(`${TOKEN_VERSION}.`);
}

export function createSignedAccessToken(
  purpose: string,
  claims: Record<string, unknown>,
  ttlSeconds: number,
  options: SignedAccessTokenOptions = {}
) {
  assertPurpose(purpose);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Signed access token TTL must be a positive integer');
  }

  const [secret] = getServerTokenSecretCandidates(options.secret);
  if (!secret) throw new Error('Signed access token secret is unavailable');

  const iat = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const fullClaims: SignedAccessTokenClaims = {
    ...claims,
    pur: purpose,
    iat,
    exp: iat + ttlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(fullClaims)).toString('base64url');
  const content = `${TOKEN_VERSION}.${payload}`;
  const signature = sign(content, secret, purpose).toString('base64url');

  return {
    claims: fullClaims,
    expiresAt: new Date(fullClaims.exp * 1000).toISOString(),
    token: `${content}.${signature}`,
  };
}

/**
 * Returns the verified claims, or null when the token is malformed, signed
 * for another purpose or secret, or expired.
 */
export function verifySignedAccessToken(
  purpose: string,
  token: unknown,
  options: SignedAccessTokenOptions = {}
): SignedAccessTokenClaims | null {
  assertPurpose(purpose);
  if (!isSignedAccessToken(token) || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, signature] = parts;
  if (
    !payload ||
    !signature ||
    !BASE64URL_PATTERN.test(payload) ||
    !BASE64URL_PATTERN.test(signature)
  ) {
    return null;
  }

  const received = Buffer.from(signature, 'base64url');
  const content = `${TOKEN_VERSION}.${payload}`;
  const signatureMatches = getServerTokenSecretCandidates(options.secret).some(
    (secret) => {
      const expected = sign(content, secret, purpose);
      return (
        expected.length === received.length &&
        timingSafeEqual(expected, received)
      );
    }
  );
  if (!signatureMatches) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    return null;
  }

  const record = claims as Record<string, unknown>;
  if (
    record.pur !== purpose ||
    typeof record.iat !== 'number' ||
    typeof record.exp !== 'number'
  ) {
    return null;
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (record.exp <= nowSeconds) return null;

  return record as SignedAccessTokenClaims;
}
