import { VaultCryptoError } from './errors';

/** Crockford base32: no I, L, O or U, so hand-copied codes stay readable. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * Decodes Crockford base32 to exactly `length` bytes. Separators and case are
 * ignored and the look-alike letters O, I and L are read as digits. Trailing
 * padding bits must be zero so each byte string has one encoding.
 */
export function decodeBase32(input: string, length: number): Uint8Array {
  const normalized = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (normalized.length !== Math.ceil((length * 8) / 5)) {
    throw new VaultCryptoError('invalid_input', 'Wrong base32 length');
  }
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of normalized) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      throw new VaultCryptoError('invalid_input', 'Invalid base32 character');
    }
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >>> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (buffer !== 0) {
    throw new VaultCryptoError('invalid_input', 'Non-zero base32 padding');
  }
  return out;
}

export function groupCode(code: string, size = 4): string {
  return code.match(new RegExp(`.{1,${size}}`, 'g'))?.join('-') ?? '';
}
