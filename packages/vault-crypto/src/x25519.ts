import { VaultCryptoError } from './errors';

/**
 * Canonical X25519 public keys (RFC 7748 §5): the little-endian u-coordinate
 * must be below p = 2^255 - 19, with the unused top bit clear, so each key has
 * one encoding. It must lie on Curve25519 rather than its twist and must not
 * be one of the small-order points, so equal encodings are exactly equal
 * Diffie-Hellman keys and freshness can compare encodings.
 */
const P = (1n << 255n) - 19n;
const A = 486662n;

const SMALL_ORDER = new Set<bigint>([
  0n,
  1n,
  325606250916557431795983626356110631294008115727848805560023387167927233504n,
  39382357235489614581723060781553021112529911719440698176882885853963445705823n,
  P - 1n,
]);

function modPow(base: bigint, exp: bigint): bigint {
  let result = 1n;
  let b = base % P;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

function decodeU(key: Uint8Array): bigint {
  let u = 0n;
  for (let i = key.length - 1; i >= 0; i--) u = (u << 8n) | BigInt(key[i] ?? 0);
  return u;
}

export function assertCanonicalX25519(
  key: Uint8Array,
  what = 'X25519 key'
): void {
  if (key.length !== 32 || ((key[31] ?? 0) & 0x80) !== 0) {
    throw new VaultCryptoError('invalid_input', `Non-canonical ${what}`);
  }
  const u = decodeU(key);
  if (u >= P || SMALL_ORDER.has(u)) {
    throw new VaultCryptoError('invalid_input', `Non-canonical ${what}`);
  }
  // On the curve iff u^3 + A u^2 + u is a non-zero square (Euler's criterion).
  const rhs = (((u * u) % P) * u + ((A * u) % P) * u + u) % P;
  if (rhs === 0n || modPow(rhs, (P - 1n) / 2n) !== 1n) {
    throw new VaultCryptoError('invalid_input', `${what} is not on Curve25519`);
  }
}
