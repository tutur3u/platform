import { hmac } from '@noble/hashes/hmac.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { asBufferSource } from './bytes';
import { VaultCryptoError } from './errors';

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(nobleSha256, key, data);
}

/** HKDF-SHA256 (RFC 5869) through WebCrypto. */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  if (!Number.isInteger(length) || length <= 0 || length > 255 * 32) {
    throw new VaultCryptoError('invalid_input', 'Invalid HKDF length');
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    asBufferSource(ikm),
    'HKDF',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      info: asBufferSource(info),
    },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}
