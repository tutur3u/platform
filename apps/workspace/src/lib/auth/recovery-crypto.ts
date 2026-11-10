import crypto from 'node:crypto';

const DEV_HASH_SECRET = 'tuturuuu-auth-recovery-dev-secret';

function getHashSecret() {
  const secret =
    process.env.AUTH_RECOVERY_HASH_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing AUTH_RECOVERY_HASH_SECRET');
  }

  return DEV_HASH_SECRET;
}

export function createAuthRecoveryToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createAuthRecoveryCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashAuthRecoveryToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashAuthRecoveryCode(email: string, code: string) {
  return crypto
    .createHmac('sha256', getHashSecret())
    .update(email.trim().toLowerCase())
    .update('\0')
    .update(code.trim())
    .digest('hex');
}

export function hashAuthRecoveryMetadata(value: string | null | undefined) {
  if (!value) return null;

  return crypto.createHash('sha256').update(value).digest('hex');
}
