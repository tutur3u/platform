import { ed25519 } from '@noble/curves/ed25519.js';
import { requireLength } from './bytes';
import type { CanonicalObject } from './canonical';
import { contextBytes, type Purpose } from './context';
import { VaultCryptoError } from './errors';

export const ED25519_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

export type SigningKeyPair = {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
};

export function generateSigningKeyPair(): SigningKeyPair {
  const secretKey = ed25519.utils.randomSecretKey();
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

export function signingPublicKey(secretKey: Uint8Array): Uint8Array {
  requireLength(secretKey, ED25519_KEY_BYTES, 'Secret key');
  return ed25519.getPublicKey(secretKey);
}

/** Ed25519 (RFC 8032) over `label ‖ 0x00 ‖ CBOR(object)`. */
export function signObject(
  secretKey: Uint8Array,
  purpose: Purpose,
  object: CanonicalObject
): Uint8Array {
  requireLength(secretKey, ED25519_KEY_BYTES, 'Secret key');
  return ed25519.sign(contextBytes(purpose, object), secretKey);
}

/**
 * Verification with `zip215: false`: non-canonical point and scalar encodings
 * and small-order public keys are rejected, so `s + L` and similar re-encodings
 * fail. The check is Noble's cofactored equation; there is no separate
 * small-order `R` rejection.
 */
export function verifyObject(
  publicKey: Uint8Array,
  purpose: Purpose,
  object: CanonicalObject,
  signature: Uint8Array
): boolean {
  if (
    publicKey.length !== ED25519_KEY_BYTES ||
    signature.length !== ED25519_SIGNATURE_BYTES
  ) {
    return false;
  }
  try {
    return ed25519.verify(signature, contextBytes(purpose, object), publicKey, {
      zip215: false,
    });
  } catch {
    return false;
  }
}

export function assertSignature(
  publicKey: Uint8Array,
  purpose: Purpose,
  object: CanonicalObject,
  signature: Uint8Array
): void {
  if (!verifyObject(publicKey, purpose, object, signature)) {
    throw new VaultCryptoError(
      'bad_signature',
      'Signature verification failed'
    );
  }
}
