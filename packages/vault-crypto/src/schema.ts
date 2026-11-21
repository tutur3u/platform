import { VaultCryptoError } from './errors';

/**
 * Exact wire-schema checks. Canonical encoding restricts the value domain;
 * these checks make every verifier reject missing, extra or mistyped fields
 * instead of relying on TypeScript types at the boundary.
 */
export function malformed(what: string): never {
  throw new VaultCryptoError('unsupported_format', `Malformed ${what}`);
}

export function record(
  value: unknown,
  keys: readonly string[],
  what: string
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    malformed(what);
  }
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k))
  ) {
    malformed(what);
  }
  return value as Record<string, unknown>;
}

export function bytes(
  value: unknown,
  length: number,
  what: string
): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length)
    malformed(what);
  return value;
}

export function nullableBytes(
  value: unknown,
  length: number,
  what: string
): Uint8Array | null {
  return value === null ? null : bytes(value, length, what);
}

export function count(value: unknown, what: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    malformed(what);
  return value;
}

export function bool(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') malformed(what);
  return value;
}

export function text(value: unknown, what: string, max = 256): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max)
    malformed(what);
  return value;
}

export function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  what: string
): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    malformed(what);
  return value as T;
}

export function list(value: unknown, what: string, max = 1024): unknown[] {
  if (!Array.isArray(value) || value.length > max) malformed(what);
  return value;
}
