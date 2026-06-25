import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';

const EMAIL_UNSUBSCRIBE_TOKEN_TYPE = 'global_email_unsubscribe';
const EMAIL_UNSUBSCRIBE_TOKEN_VERSION = 1;
const LOCAL_DEVELOPMENT_SECRET =
  'tuturuuu-local-development-email-unsubscribe-secret';

export type EmailUnsubscribeTokenClaims = {
  email: string;
  iat: number;
  jti: string;
  typ: typeof EMAIL_UNSUBSCRIBE_TOKEN_TYPE;
  v: typeof EMAIL_UNSUBSCRIBE_TOKEN_VERSION;
};

type EmailUnsubscribeTokenOptions = {
  now?: Date;
  secret?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSecretCandidates(explicitSecret?: string) {
  const candidates = explicitSecret
    ? [explicitSecret]
    : [
        process.env.TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET,
        process.env.EMAIL_UNSUBSCRIBE_SECRET,
        process.env.TUTURUUU_APP_COORDINATION_SECRET,
        process.env.NEXTAUTH_SECRET,
        process.env.SUPABASE_SECRET_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_SERVICE_KEY,
      ];

  const secrets = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0 && process.env.NODE_ENV !== 'production') {
    return [LOCAL_DEVELOPMENT_SECRET];
  }

  if (secrets.length === 0) {
    throw new Error('Missing TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET');
  }

  return [...new Set(secrets)];
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signContent(content: string, secret: string) {
  return createHmac('sha256', secret).update(content).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function parseClaims(value: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(value)) as unknown;
  } catch {
    return null;
  }
}

function isEmailUnsubscribeTokenClaims(
  value: unknown
): value is EmailUnsubscribeTokenClaims {
  if (!value || typeof value !== 'object') return false;

  const claims = value as Partial<EmailUnsubscribeTokenClaims>;

  return (
    claims.typ === EMAIL_UNSUBSCRIBE_TOKEN_TYPE &&
    claims.v === EMAIL_UNSUBSCRIBE_TOKEN_VERSION &&
    typeof claims.email === 'string' &&
    typeof claims.iat === 'number' &&
    typeof claims.jti === 'string'
  );
}

export function createEmailUnsubscribeToken(
  email: string,
  options: EmailUnsubscribeTokenOptions = {}
) {
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const claims: EmailUnsubscribeTokenClaims = {
    email: normalizeEmail(email),
    iat: nowSeconds,
    jti: randomUUID(),
    typ: EMAIL_UNSUBSCRIBE_TOKEN_TYPE,
    v: EMAIL_UNSUBSCRIBE_TOKEN_VERSION,
  };
  const encodedClaims = encodeBase64Url(JSON.stringify(claims));
  const signature = signContent(
    encodedClaims,
    getSecretCandidates(options.secret)[0]!
  );

  return `${encodedClaims}.${signature}`;
}

export function verifyEmailUnsubscribeToken(
  token: string,
  options: EmailUnsubscribeTokenOptions = {}
):
  | {
      claims: EmailUnsubscribeTokenClaims;
      ok: true;
    }
  | { error: string; ok: false } {
  const [encodedClaims, signature, ...extra] = token.split('.');

  if (extra.length > 0 || !encodedClaims || !signature) {
    return { error: 'malformed_token', ok: false };
  }

  const validSignature = getSecretCandidates(options.secret).some((secret) =>
    safeEqual(signature, signContent(encodedClaims, secret))
  );

  if (!validSignature) {
    return { error: 'invalid_signature', ok: false };
  }

  const claims = parseClaims(encodedClaims);

  if (!isEmailUnsubscribeTokenClaims(claims)) {
    return { error: 'invalid_claims', ok: false };
  }

  const normalizedEmail = normalizeEmail(claims.email);
  if (!normalizedEmail) {
    return { error: 'invalid_email', ok: false };
  }

  return {
    claims: {
      ...claims,
      email: normalizedEmail,
    },
    ok: true,
  };
}

export function createEmailUnsubscribeUrl(email: string) {
  const origin = resolveTuturuuuWebAppUrl();
  const url = new URL('/api/email/unsubscribe', origin);
  url.searchParams.set('token', createEmailUnsubscribeToken(email));
  return url.toString();
}
