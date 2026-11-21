import { encodeBase32, groupCode } from './base32';
import { utf8 } from './bytes';
import { contextBytes } from './context';
import { VaultCryptoError } from './errors';
import { hkdfSha256, sha256 } from './kdf';

export type PublicKeyKind = 'x25519' | 'ed25519';

/** SHA-256 over the labelled canonical encoding of a public key. */
export function fingerprint(
  kind: PublicKeyKind,
  publicKey: Uint8Array
): Uint8Array {
  return sha256(contextBytes('fingerprint', { kind, key: publicKey }));
}

/** First 128 bits in grouped base32, for people comparing keys. */
export function displayFingerprint(fp: Uint8Array): string {
  return groupCode(encodeBase32(fp.subarray(0, 16)));
}

export type UnlockMethod = 'passkey' | 'recovery' | 'pin';

export type UnlockContext = {
  readonly vault_user_id: Uint8Array;
  readonly identity_tier: 'strong' | 'pin';
  readonly method_id: Uint8Array;
  readonly params_version: number;
};

/**
 * Key-encryption key for one unlock method:
 * `HKDF(ikm, salt = wrap_salt, info = "tuturuuu/vault/kek/<method>/v1" ‖ ctx)`.
 */
export async function deriveKek(
  method: UnlockMethod,
  ikm: Uint8Array,
  wrapSalt: Uint8Array,
  context: UnlockContext
): Promise<Uint8Array> {
  if (ikm.length < 32 || wrapSalt.length < 16) {
    throw new VaultCryptoError('invalid_input', 'Weak KEK input');
  }
  if ((method === 'pin') !== (context.identity_tier === 'pin')) {
    throw new VaultCryptoError(
      'invalid_input',
      'Method does not match identity tier'
    );
  }
  return hkdfSha256(
    ikm,
    wrapSalt,
    contextBytes(`kek/${method}`, { ...context, method }),
    32
  );
}

/**
 * The WebAuthn PRF input is a constant: it contains no user or provider
 * identifier, so changing identity provider never changes the PRF output.
 */
export const PASSKEY_PRF_INPUT: Uint8Array = sha256(
  utf8('tuturuuu/vault/prf/v1')
);
