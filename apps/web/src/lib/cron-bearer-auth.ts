import { createHash, timingSafeEqual } from 'node:crypto';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Constant-time Bearer token check against one or more configured secrets.
 * Compares fixed-length SHA-256 digests so secret length is not leaked.
 */
export function verifyBearerSecrets(
  authorizationHeader: string | null,
  secrets: ReadonlyArray<string | undefined | null>
): boolean {
  if (!authorizationHeader) return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  if (!match?.[1]) return false;

  const providedDigest = sha256(match[1]);
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    if (timingSafeEqual(providedDigest, sha256(secret))) {
      matched = true;
    }
  }
  return matched;
}
