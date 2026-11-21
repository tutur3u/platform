import { decode, encode } from 'cborg';
import { equalBytes } from './bytes';
import { VaultCryptoError } from './errors';

/**
 * Values that can appear in a vault object. Floats, undefined, bigints, maps
 * with non-string keys and tags are excluded so every object has exactly one
 * deterministic CBOR encoding (RFC 8949 §4.2).
 */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export type CanonicalObject = { readonly [key: string]: CanonicalValue };

const MAX_DEPTH = 16;

/** A lone UTF-16 surrogate would be replaced by U+FFFD when encoded. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertWellFormed(text: string): void {
  if (LONE_SURROGATE.test(text)) {
    throw new VaultCryptoError('invalid_input', 'Ill-formed string');
  }
}

function assertCanonicalValue(value: unknown, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new VaultCryptoError('invalid_input', 'Object nesting too deep');
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    assertWellFormed(value);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new VaultCryptoError('invalid_input', 'Only safe integers allowed');
    }
    return;
  }
  if (value instanceof Uint8Array) return;
  if (Array.isArray(value)) {
    for (const item of value) assertCanonicalValue(item, depth + 1);
    return;
  }
  if (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [key, item] of Object.entries(value)) {
      assertWellFormed(key);
      assertCanonicalValue(item, depth + 1);
    }
    return;
  }
  throw new VaultCryptoError('invalid_input', 'Unsupported value type');
}

/** Deterministic CBOR: shortest integers, sorted keys, definite lengths. */
export function encodeCanonical(value: CanonicalValue): Uint8Array {
  assertCanonicalValue(value, 0);
  return encode(value);
}

/**
 * Decodes and rejects anything that is not the canonical encoding of an
 * allowed value: duplicate keys, indefinite lengths, non-minimal integers,
 * floats, undefined and unsorted maps all fail.
 */
export function decodeCanonical(bytes: Uint8Array): CanonicalValue {
  let value: unknown;
  try {
    value = decode(bytes, {
      strict: true,
      rejectDuplicateMapKeys: true,
      allowIndefinite: false,
      allowUndefined: false,
      allowInfinity: false,
      allowNaN: false,
      allowBigInt: false,
      useMaps: false,
      strictUtf8: true,
    });
  } catch {
    throw new VaultCryptoError('non_canonical', 'Malformed CBOR');
  }
  try {
    assertCanonicalValue(value, 0);
  } catch {
    throw new VaultCryptoError('non_canonical', 'Disallowed CBOR value');
  }
  if (!equalBytes(encode(value), bytes)) {
    throw new VaultCryptoError('non_canonical', 'Non-canonical CBOR');
  }
  return value as CanonicalValue;
}

/** Decodes an object and checks it has exactly the expected keys. */
export function decodeObject(
  bytes: Uint8Array,
  keys: readonly string[]
): Record<string, CanonicalValue> {
  const value = decodeCanonical(bytes);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw new VaultCryptoError('unsupported_format', 'Expected an object');
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((k, i) => k !== expected[i])
  ) {
    throw new VaultCryptoError(
      'unsupported_format',
      'Unexpected object fields'
    );
  }
  return value as Record<string, CanonicalValue>;
}
