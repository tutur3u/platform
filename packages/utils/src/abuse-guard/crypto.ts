/**
 * Web Crypto helpers for the abuse-guard store: client-side key hashing and
 * internal request signing. Runs in Node, Vercel functions and Workers.
 */

const encoder = new TextEncoder();

/** Signature header names for authenticated HTTP RPC. */
export const GUARD_TIMESTAMP_HEADER = 'x-guard-ts';
export const GUARD_SIGNATURE_HEADER = 'x-guard-sig';
/** Accepted clock skew between the signer and the Worker. */
export const GUARD_SIGNATURE_MAX_SKEW_MS = 60_000;
/** Minimum length of every signing secret, operator token and key pepper. */
export const ABUSE_GUARD_MIN_SECRET_LENGTH = 32;

export function isStrongGuardSecret(value: string) {
  return value.length >= ABUSE_GUARD_MIN_SECRET_LENGTH;
}

/**
 * Returns the store origin, or null unless it is HTTPS. Plain HTTP is accepted
 * only on loopback for local workerd verification.
 */
export function resolveGuardOrigin(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    const loopback =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]';
    return url.protocol === 'https:' || (url.protocol === 'http:' && loopback)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function importHmacKey(secret: string) {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    // Bounded: one entry per configured pepper/secret value.
    if (hmacKeys.size >= 8) hmacKeys.clear();
    hmacKeys.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

async function hmac(secret: string, message: string) {
  const key = await importHmacKey(secret);
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  );
}

/**
 * Opaque digest for a partition or key. `domain` separates families and
 * purposes so the same raw value never maps to the same digest across them.
 */
export async function hashGuardValue(
  pepper: string,
  domain: string,
  value: string
) {
  return toBase64Url(await hmac(pepper, `${domain}\u0000${value}`));
}

async function sha256Base64Url(body: string) {
  return toBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body)))
  );
}

function signingPayload(
  timestamp: string,
  method: string,
  path: string,
  bodyHash: string
) {
  return `${timestamp}\n${method.toUpperCase()} ${path}\n${bodyHash}`;
}

export async function signGuardRequest(input: {
  secret: string;
  method: string;
  path: string;
  body: string;
  timestamp: number;
}) {
  const timestamp = `${input.timestamp}`;
  const signature = toBase64Url(
    await hmac(
      input.secret,
      signingPayload(
        timestamp,
        input.method,
        input.path,
        await sha256Base64Url(input.body)
      )
    )
  );
  return { timestamp, signature };
}

/** Length-independent comparison over the full input. */
export function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.byteLength ^ b.byteLength;
  const length = Math.max(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

/**
 * Verifies a signed request against every accepted secret (current, then the
 * previous one during rotation). Every secret is checked to keep timing flat.
 * A configuration containing any short secret verifies nothing.
 */
export async function verifyGuardRequest(input: {
  secrets: readonly string[];
  method: string;
  path: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  now: number;
}) {
  if (
    !input.timestamp ||
    !input.signature ||
    input.secrets.length === 0 ||
    !input.secrets.every(isStrongGuardSecret)
  ) {
    return false;
  }
  if (!/^\d{1,16}$/u.test(input.timestamp)) return false;
  const skew = Math.abs(input.now - Number(input.timestamp));
  if (!Number.isFinite(skew) || skew > GUARD_SIGNATURE_MAX_SKEW_MS) {
    return false;
  }
  const bodyHash = await sha256Base64Url(input.body);
  const payload = signingPayload(
    input.timestamp,
    input.method,
    input.path,
    bodyHash
  );
  let matched = false;
  for (const secret of input.secrets) {
    const expected = toBase64Url(await hmac(secret, payload));
    if (constantTimeEqual(expected, input.signature)) matched = true;
  }
  return matched;
}

/** Parses a comma-separated secret list, dropping blanks. */
export function parseGuardSecrets(value: string | undefined | null) {
  return (value ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0);
}
