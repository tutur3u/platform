// Mastermind secret entry pairing: one 80-bit code, read off the machine
// through a path that is not Web, authenticates the machine key to the phone
// and the phone's owner key to the machine. Each side proves it knows the
// code with an HMAC under a key derived from it; the code itself never
// travels. Design: apps/docs/build/devops/mastermind-secret-entry.mdx#pairing.
import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { lengthPrefixed } from './secret-protocol.mjs';

export const PAIR_INFO = 'tuturuuu-mm-secret-pair-v1';
export const PAIR_MACHINE_DOMAIN = 'tuturuuu-mm-secret-pair-machine-v1';
export const PAIR_OWNER_DOMAIN = 'tuturuuu-mm-secret-pair-owner-v1';
export const PAIR_CODE_BYTES = 10;
/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALIASES = { I: '1', L: '1', O: '0' };

/** A fresh code as `XXXX-XXXX-XXXX-XXXX` (80 random bits). */
export function newPairingCode(bytes = randomBytes(PAIR_CODE_BYTES)) {
  if (bytes.length !== PAIR_CODE_BYTES) throw new Error('pair_code_bytes');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out.match(/.{4}/g).join('-');
}

/**
 * The code's 10 bytes, or null. Accepts lower case, spaces, dashes and the
 * Crockford look-alikes (I and L read as 1, O as 0).
 */
export function parsePairingCode(text) {
  if (typeof text !== 'string') return null;
  const chars = text
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[ILO]/g, (c) => ALIASES[c]);
  if (chars.length !== 16) return null;
  const out = [];
  let bits = 0;
  let value = 0;
  for (const char of chars) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** HKDF-SHA256 of the code, salted with the pairing id. */
export const pairingKey = (codeBytes, pairingId) =>
  Buffer.from(
    hkdfSync('sha256', codeBytes, Buffer.from(pairingId, 'utf8'), PAIR_INFO, 32)
  );

export const machineMac = (
  key,
  { pairingId, machineId, machineLabel, signerKey, expiresAt }
) =>
  createHmac('sha256', key)
    .update(
      lengthPrefixed(PAIR_MACHINE_DOMAIN, [
        pairingId,
        machineId,
        machineLabel,
        signerKey,
        expiresAt,
      ])
    )
    .digest();

export const ownerMac = (
  key,
  { pairingId, machineId, signerKey, ownerKey, expiresAt }
) =>
  createHmac('sha256', key)
    .update(
      lengthPrefixed(PAIR_OWNER_DOMAIN, [
        pairingId,
        machineId,
        signerKey,
        ownerKey,
        expiresAt,
      ])
    )
    .digest();

/** Constant-time comparison of two MACs of equal length. */
export const macEqual = (a, b) =>
  Buffer.isBuffer(a) &&
  Buffer.isBuffer(b) &&
  a.length === b.length &&
  timingSafeEqual(a, b);
