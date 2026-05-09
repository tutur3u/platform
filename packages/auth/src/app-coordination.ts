import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'ttr_app_';
const TOKEN_ISSUER = 'tuturuuu';
const TOKEN_AUDIENCE = 'tuturuuu-api';
const DEFAULT_EXPIRES_IN_SECONDS = 8 * 60 * 60;

export type AppCoordinationTokenClaims = {
  aud: typeof TOKEN_AUDIENCE;
  email: string | null;
  exp: number;
  iat: number;
  iss: typeof TOKEN_ISSUER;
  jti: string;
  origin_app: string;
  scopes: string[];
  sub: string;
  target_app: string;
  typ: 'app_coordination';
};

export type AppCoordinationTokenPayload = {
  email?: string | null;
  expiresInSeconds?: number;
  originApp?: string;
  scopes?: string[];
  targetApp: string;
  userId: string;
};

export type AppCoordinationTokenVerification =
  | {
      claims: AppCoordinationTokenClaims;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

function getSecret(explicitSecret?: string) {
  const secret =
    explicitSecret ??
    process.env.TUTURUUU_APP_COORDINATION_SECRET ??
    process.env.APP_COORDINATION_TOKEN_SECRET;

  if (!secret?.trim()) {
    throw new Error('Missing TUTURUUU_APP_COORDINATION_SECRET');
  }

  return secret;
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

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isClaims(value: unknown): value is AppCoordinationTokenClaims {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const claims = value as Partial<AppCoordinationTokenClaims>;

  return (
    claims.typ === 'app_coordination' &&
    claims.iss === TOKEN_ISSUER &&
    claims.aud === TOKEN_AUDIENCE &&
    typeof claims.sub === 'string' &&
    typeof claims.target_app === 'string' &&
    typeof claims.origin_app === 'string' &&
    typeof claims.iat === 'number' &&
    typeof claims.exp === 'number' &&
    typeof claims.jti === 'string' &&
    Array.isArray(claims.scopes)
  );
}

export function isAppCoordinationToken(token: string | null | undefined) {
  return Boolean(token?.startsWith(TOKEN_PREFIX));
}

export function getBearerAppCoordinationToken(
  request: Pick<Request, 'headers'>
) {
  const authorization =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice(7).trim();

  return isAppCoordinationToken(token) ? token : null;
}

export function createAppCoordinationToken(
  payload: AppCoordinationTokenPayload,
  options: {
    now?: Date;
    secret?: string;
  } = {}
) {
  const secret = getSecret(options.secret);
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const expiresInSeconds =
    payload.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const claims: AppCoordinationTokenClaims = {
    aud: TOKEN_AUDIENCE,
    email: payload.email ?? null,
    exp: nowSeconds + expiresInSeconds,
    iat: nowSeconds,
    iss: TOKEN_ISSUER,
    jti: randomUUID(),
    origin_app: payload.originApp ?? 'web',
    scopes: payload.scopes ?? [],
    sub: payload.userId,
    target_app: payload.targetApp,
    typ: 'app_coordination',
  };
  const unsigned = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(claims)
  )}`;
  const signature = signContent(unsigned, secret);

  return {
    claims,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    token: `${TOKEN_PREFIX}${unsigned}.${signature}`,
  };
}

export function verifyAppCoordinationToken(
  token: string,
  options: {
    now?: Date;
    secret?: string;
  } = {}
): AppCoordinationTokenVerification {
  if (!isAppCoordinationToken(token)) {
    return { error: 'Invalid token type', ok: false };
  }

  const withoutPrefix = token.slice(TOKEN_PREFIX.length);
  const parts = withoutPrefix.split('.');

  if (parts.length !== 3) {
    return { error: 'Invalid token format', ok: false };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  if (!encodedHeader || !encodedPayload || !signature) {
    return { error: 'Invalid token format', ok: false };
  }

  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signContent(unsigned, getSecret(options.secret));
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return { error: 'Invalid token signature', ok: false };
  }

  const claims = safeJsonParse(decodeBase64Url(encodedPayload));

  if (!isClaims(claims)) {
    return { error: 'Invalid token claims', ok: false };
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);

  if (claims.exp <= nowSeconds) {
    return { error: 'Token expired', ok: false };
  }

  return {
    claims,
    ok: true,
  };
}
