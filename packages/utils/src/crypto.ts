import {
  createHash,
  randomBytes,
  type ScryptOptions,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Server-only password hashing for shared-secret credentials such as Meet
 * guest passwords and Nova challenge passwords.
 *
 * New hashes use scrypt and a self-describing encoding:
 *
 *   scrypt$<N>$<r>$<p>$<base64url salt>$<base64url derived key>
 *
 * Rows written before the scrypt rollout hold an unprefixed hex SHA-256 digest
 * of `password + salt` with the salt in a separate column. Those rows still
 * verify through {@link verifyPassword}, which reports `needsRehash` so callers
 * can upgrade the stored value in the same request.
 */

export const PASSWORD_KDF_ID = 'scrypt';

export const PASSWORD_KDF_PARAMS = Object.freeze({
  N: 2 ** 15,
  r: 8,
  p: 1,
  saltBytes: 16,
  keyBytes: 32,
});

/** Inputs longer than this are rejected before any key derivation runs. */
export const MAX_PASSWORD_LENGTH = 1024;

const MIN_LOG2_N = 14;
const MAX_LOG2_N = 20;
const MAX_R = 32;
const MAX_P = 16;
const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 64;
const MIN_KEY_BYTES = 16;
const MAX_KEY_BYTES = 64;
const MAX_SCRYPT_MEMORY_BYTES = 256 * 1024 * 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const DECIMAL_PATTERN = /^[1-9][0-9]{0,9}$/u;
const LEGACY_HASH_PATTERN = /^[0-9a-f]{64}$/u;

export type PasswordHashScheme = 'scrypt' | 'legacy-sha256' | 'unknown';

export interface PasswordVerification {
  /** Whether the presented password matches the stored hash. */
  valid: boolean;
  /**
   * True when the stored hash verified but uses a legacy scheme or older KDF
   * parameters, so the caller should replace it with {@link hashPassword}.
   */
  needsRehash: boolean;
  scheme: PasswordHashScheme;
}

export interface StoredPassword {
  hash: string | null | undefined;
  /** Only used by legacy salted SHA-256 rows. */
  salt?: string | null;
}

interface ParsedKdfHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyBytes: number,
  params: { N: number; r: number; p: number }
) {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    // Node rejects derivations whose working set exceeds maxmem (32 MiB by
    // default), which N=2^15, r=8 already reaches. Allow twice the block
    // memory so parameter upgrades within the parse bounds still run.
    maxmem: 256 * params.N * params.r,
  };

  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyBytes, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function decodeBase64Url(value: string) {
  if (!BASE64URL_PATTERN.test(value)) return null;
  return Buffer.from(value, 'base64url');
}

function parseDecimal(value: string | undefined) {
  if (!value || !DECIMAL_PATTERN.test(value)) return null;
  return Number(value);
}

function isAcceptedN(N: number) {
  if (!Number.isSafeInteger(N)) return false;
  const log2 = Math.log2(N);
  return Number.isInteger(log2) && log2 >= MIN_LOG2_N && log2 <= MAX_LOG2_N;
}

/**
 * Parses an encoded scrypt hash. Returns null for anything malformed or
 * outside the accepted cost bounds, so hostile stored values cannot request
 * unbounded work.
 */
export function parsePasswordKdfHash(
  encoded: string | null | undefined
): ParsedKdfHash | null {
  if (typeof encoded !== 'string' || encoded.length > 512) return null;

  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== PASSWORD_KDF_ID) return null;

  const N = parseDecimal(parts[1]);
  const r = parseDecimal(parts[2]);
  const p = parseDecimal(parts[3]);
  if (N === null || r === null || p === null) return null;
  if (!isAcceptedN(N) || r > MAX_R || p > MAX_P) return null;
  if (128 * N * r > MAX_SCRYPT_MEMORY_BYTES) return null;

  const salt = decodeBase64Url(parts[4] ?? '');
  const key = decodeBase64Url(parts[5] ?? '');
  if (!salt || !key) return null;
  if (salt.length < MIN_SALT_BYTES || salt.length > MAX_SALT_BYTES) return null;
  if (key.length < MIN_KEY_BYTES || key.length > MAX_KEY_BYTES) return null;

  return { N, r, p, salt, key };
}

export function isPasswordKdfHash(encoded: string | null | undefined) {
  return parsePasswordKdfHash(encoded) !== null;
}

/** Whether a stored hash should be replaced with the current KDF format. */
export function passwordHashNeedsRehash(encoded: string | null | undefined) {
  const parsed = parsePasswordKdfHash(encoded);
  if (!parsed) return true;
  return (
    parsed.N !== PASSWORD_KDF_PARAMS.N ||
    parsed.r !== PASSWORD_KDF_PARAMS.r ||
    parsed.p !== PASSWORD_KDF_PARAMS.p ||
    parsed.salt.length !== PASSWORD_KDF_PARAMS.saltBytes ||
    parsed.key.length !== PASSWORD_KDF_PARAMS.keyBytes
  );
}

function assertPasswordInput(password: unknown): asserts password is string {
  if (typeof password !== 'string') {
    throw new TypeError('Password must be a string');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError('Password is too long');
  }
}

/** Hashes a password with scrypt and returns the self-describing encoding. */
export async function hashPassword(password: string) {
  assertPasswordInput(password);
  const { N, r, p, saltBytes, keyBytes } = PASSWORD_KDF_PARAMS;
  const salt = randomBytes(saltBytes);
  const key = await deriveScryptKey(password, salt, keyBytes, { N, r, p });

  return [
    PASSWORD_KDF_ID,
    N,
    r,
    p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Legacy salted SHA-256 digest. Only kept so existing rows can be verified and
 * upgraded; never use it to store a new credential.
 */
export function hashLegacyPassword(password: string, salt: string) {
  return createHash('sha256')
    .update(password + salt, 'utf8')
    .digest('hex');
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

const INVALID: PasswordVerification = Object.freeze({
  valid: false,
  needsRehash: false,
  scheme: 'unknown' as const,
});

/**
 * Verifies a plaintext password against a stored hash. Accepts the current
 * scrypt encoding and the legacy salted SHA-256 format. Never throws for
 * malformed stored values or oversized input; those simply fail to verify.
 */
export async function verifyPassword(
  password: string,
  stored: StoredPassword
): Promise<PasswordVerification> {
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return INVALID;
  }

  const hash = stored.hash;
  if (typeof hash !== 'string' || hash.length === 0) return INVALID;

  if (hash.startsWith(`${PASSWORD_KDF_ID}$`)) {
    const parsed = parsePasswordKdfHash(hash);
    if (!parsed) return { ...INVALID, scheme: 'scrypt' };

    let derived: Buffer;
    try {
      derived = await deriveScryptKey(
        password,
        parsed.salt,
        parsed.key.length,
        {
          N: parsed.N,
          r: parsed.r,
          p: parsed.p,
        }
      );
    } catch {
      return { ...INVALID, scheme: 'scrypt' };
    }

    const valid = safeEqual(derived, parsed.key);
    return {
      valid,
      needsRehash: valid && passwordHashNeedsRehash(hash),
      scheme: 'scrypt',
    };
  }

  if (LEGACY_HASH_PATTERN.test(hash)) {
    const salt = stored.salt;
    if (typeof salt !== 'string' || salt.length === 0) {
      return { ...INVALID, scheme: 'legacy-sha256' };
    }

    const candidate = Buffer.from(hashLegacyPassword(password, salt), 'hex');
    const valid = safeEqual(candidate, Buffer.from(hash, 'hex'));
    return { valid, needsRehash: valid, scheme: 'legacy-sha256' };
  }

  return INVALID;
}
