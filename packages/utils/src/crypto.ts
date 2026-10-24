import {
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
 * Older unprefixed SHA-256 rows are reset markers. They never verify;
 * the owning product must direct its manager or plan creator to replace them.
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

export type PasswordVerification =
  | {
      valid: true;
      needsRehash: boolean;
      scheme: 'scrypt';
      resetRequired: false;
    }
  | {
      valid: false;
      needsRehash: false;
      scheme: 'scrypt' | 'unknown';
      resetRequired: false;
    }
  | {
      valid: false;
      needsRehash: false;
      scheme: 'legacy-sha256';
      resetRequired: true;
    };

export interface StoredPassword {
  hash: string | null | undefined;
  /** Retained metadata for callers with old rows; never used to verify them. */
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

/** Legacy storage is a durable reset marker, never a verification scheme. */
export function passwordRequiresReset(hash: string | null | undefined) {
  return typeof hash === 'string' && LEGACY_HASH_PATTERN.test(hash);
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

const INVALID = Object.freeze({
  valid: false,
  needsRehash: false,
  scheme: 'unknown',
  resetRequired: false,
} satisfies PasswordVerification);

/**
 * Verifies a plaintext password against a stored scrypt hash. Legacy rows
 * return resetRequired without hashing the presented password. Never throws for
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

    if (!safeEqual(derived, parsed.key))
      return { ...INVALID, scheme: 'scrypt' };
    return {
      valid: true,
      needsRehash: passwordHashNeedsRehash(hash),
      scheme: 'scrypt',
      resetRequired: false,
    };
  }

  if (passwordRequiresReset(hash)) {
    return {
      valid: false,
      needsRehash: false,
      scheme: 'legacy-sha256',
      resetRequired: true,
    };
  }

  return INVALID;
}
