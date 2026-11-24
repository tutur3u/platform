/**
 * 32-byte keys carried in a secret or text binding: the request HMAC key,
 * the permit public key and the control caller key.
 *
 * Format: either one base64url value (32 bytes, 43 characters, no padding),
 * which is the current key, or JSON text `{"current":"<key>","previous":"<key>"}`
 * during a rotation. Anything else, including an absent value, is malformed
 * and refuses every call.
 */

/** Bytes backed by an `ArrayBuffer`, as WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

export const KEY_BYTES = 32;
const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/u;

export type KeySet = Readonly<{
  current: Bytes;
  previous: Bytes | null;
}>;

export function encodeBase64Url(bytes: Bytes): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

/** Strict base64url decoding; non-canonical encodings return null. */
export function decodeBase64Url(text: unknown, maxBytes = 1024): Bytes | null {
  if (
    typeof text !== 'string' ||
    text.length === 0 ||
    text.length > Math.ceil((maxBytes * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/u.test(text)
  ) {
    return null;
  }
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
  let binary: string;
  try {
    binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return encodeBase64Url(bytes) === text ? bytes : null;
}

function decodeKey(text: unknown): Bytes | null {
  if (typeof text !== 'string' || !KEY_TEXT.test(text)) return null;
  const bytes = decodeBase64Url(text, KEY_BYTES);
  return bytes?.length === KEY_BYTES ? bytes : null;
}

function ownValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Parses a key-set binding, or null when it is absent or malformed. */
export function parseKeySet(raw: unknown): KeySet | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text.startsWith('{')) {
    const current = decodeKey(text);
    return current ? Object.freeze({ current, previous: null }) : null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const keys = Object.keys(parsed);
  if (keys.some((key) => key !== 'current' && key !== 'previous')) return null;
  const current = decodeKey(ownValue(parsed, 'current'));
  if (!current) return null;
  if (!keys.includes('previous')) {
    return Object.freeze({ current, previous: null });
  }
  const previous = decodeKey(ownValue(parsed, 'previous'));
  if (!previous) return null;
  return Object.freeze({ current, previous });
}

/** The keys to try, current first. */
export function keysOf(set: KeySet): Bytes[] {
  return set.previous ? [set.current, set.previous] : [set.current];
}

function sameBytes(left: Bytes, right: Bytes): boolean {
  let diff = left.length ^ right.length;
  for (let index = 0; index < KEY_BYTES; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

const ZERO_KEY = new Uint8Array(KEY_BYTES);

/**
 * Checks a presented caller key against the set. Both slots are always
 * compared so the time taken does not reveal which one matched.
 */
export function checkCallerKey(set: KeySet | null, presented: unknown) {
  const key = decodeKey(presented);
  if (!set || !key) return false;
  const current = sameBytes(set.current, key);
  const previousMatched = sameBytes(set.previous ?? ZERO_KEY, key);
  return current || (set.previous !== null && previousMatched);
}
