/**
 * Whether a missing workspace key must stop a write instead of storing
 * plaintext. Production runtimes and any runtime started with
 * TUTURUUU_REQUIRE_SECRETS or ENCRYPTION_REQUIRED set require encryption;
 * ENCRYPTION_REQUIRED=0 opts a development or self-hosted install out.
 */
const TRUE = /^(?:1|true|yes|on)$/iu;
const FALSE = /^(?:0|false|no|off)$/iu;

export function isEncryptionRequired(
  env: Record<string, string | undefined> = process.env
): boolean {
  const explicit = env.ENCRYPTION_REQUIRED?.trim();
  if (explicit && FALSE.test(explicit)) return false;
  if (explicit && TRUE.test(explicit)) return true;
  if (TRUE.test(env.TUTURUUU_REQUIRE_SECRETS?.trim() ?? '')) return true;
  return env.NODE_ENV === 'production';
}

/** Thrown instead of storing plaintext when encryption cannot be applied. */
export class EncryptionUnavailableError extends Error {
  readonly code = 'ENCRYPTION_UNAVAILABLE';

  constructor(
    message = 'Encryption is unavailable; refusing to store plaintext'
  ) {
    super(message);
    this.name = 'EncryptionUnavailableError';
  }
}
