export type VaultCryptoErrorCode =
  | 'invalid_input'
  | 'non_canonical'
  | 'unsupported_format'
  | 'decrypt_failed'
  | 'bad_signature'
  | 'bad_mac';

/**
 * Every failure in this package surfaces as one error type with a stable
 * code. Messages never include key material, plaintext or ciphertext.
 */
export class VaultCryptoError extends Error {
  readonly code: VaultCryptoErrorCode;

  constructor(code: VaultCryptoErrorCode, message: string) {
    super(message);
    this.name = 'VaultCryptoError';
    this.code = code;
  }
}
