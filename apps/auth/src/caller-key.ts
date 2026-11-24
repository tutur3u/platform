/**
 * Entry-point caller keys. A service binding does not authenticate its
 * caller: any Worker in the account can bind a named entry point. Every
 * entry method therefore takes its entry's caller key first, and the auth
 * Worker compares it in constant time with its own secret, current value and
 * at most one previous, before reading any other argument.
 *
 * Secret format: either one base64url value (32 bytes, 43 characters, no
 * padding), which is the current key, or JSON text
 * `{"current":"<key>","previous":"<key>"}` during a rotation. Anything else,
 * including an absent secret, is malformed and refuses every call.
 */

export const CALLER_KEY_BYTES = 32;
const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/u;

export type CallerKeySet = Readonly<{
  current: Uint8Array;
  previous: Uint8Array | null;
}>;

export type CallerKeyCheck =
  | Readonly<{ ok: true; slot: 'current' | 'previous' }>
  | Readonly<{ ok: false }>;

const REFUSED: CallerKeyCheck = Object.freeze({ ok: false });

function decodeKey(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || !KEY_TEXT.test(text)) return null;
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
  let binary: string;
  try {
    binary = atob(`${base64}=`);
  } catch {
    return null;
  }
  if (binary.length !== CALLER_KEY_BYTES) return null;
  const bytes = new Uint8Array(CALLER_KEY_BYTES);
  for (let index = 0; index < CALLER_KEY_BYTES; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  // Reject non-canonical encodings: the last character may carry unused bits.
  if (encodeKey(bytes) !== text) return null;
  return bytes;
}

function encodeKey(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function ownString(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Parses the auth-side secret, or null when it is absent or malformed. */
export function parseCallerKeySecret(raw: unknown): CallerKeySet | null {
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
  const current = decodeKey(ownString(parsed, 'current'));
  if (!current) return null;
  if (!keys.includes('previous')) {
    return Object.freeze({ current, previous: null });
  }
  const previous = decodeKey(ownString(parsed, 'previous'));
  if (!previous) return null;
  return Object.freeze({ current, previous });
}

/** XOR-accumulated comparison over the fixed key length. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  for (let index = 0; index < CALLER_KEY_BYTES; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

const ZERO_KEY = new Uint8Array(CALLER_KEY_BYTES);

/**
 * Checks a presented key against the parsed secret. Both slots are always
 * compared so the time taken does not reveal which one matched. A presented
 * value that is not a well-formed key, or a missing secret, is refused.
 */
export function checkCallerKey(
  secret: CallerKeySet | null,
  presented: unknown
): CallerKeyCheck {
  const key = decodeKey(presented);
  if (!secret || !key) return REFUSED;
  const current = sameBytes(secret.current, key);
  // With no previous slot, still compare once so timing stays uniform.
  const previousMatched = sameBytes(secret.previous ?? ZERO_KEY, key);
  const previous = secret.previous !== null && previousMatched;
  if (current) return Object.freeze({ ok: true, slot: 'current' });
  if (previous) return Object.freeze({ ok: true, slot: 'previous' });
  return REFUSED;
}
