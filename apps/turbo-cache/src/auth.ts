import type { TokenEntry } from './config';

// Tokens are never stored: the registry holds SHA-256 digests and every
// comparison runs over all entries in constant time per entry.
const BEARER = /^Bearer ([\x21-\x7e]{32,512})$/;

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function bearerDigest(header: string | null) {
  const match = BEARER.exec(header ?? '');
  return match ? sha256Hex(match[1]) : null;
}

export function findToken(digest: string | null, tokens: TokenEntry[]) {
  if (!digest) return null;
  let found: TokenEntry | null = null;
  for (const token of tokens) {
    if (timingSafeEqualHex(digest, token.sha256) && !found) found = token;
  }
  return found;
}
