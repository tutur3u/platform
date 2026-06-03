import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const SEPAY_OAUTH_STATE_COOKIE_PREFIX = 'sepay_oauth_state_';
const SEPAY_OAUTH_STATE_VERSION = 1;

type SepayOauthStatePayload = {
  expiresAt: number;
  nonce: string;
  version: typeof SEPAY_OAUTH_STATE_VERSION;
  wsId: string;
};

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getSepayOauthStateSigningSecret() {
  const secret =
    process.env.SEPAY_OAUTH_STATE_SECRET ??
    process.env.SEPAY_OAUTH_CLIENT_SECRET;

  if (!secret?.trim()) {
    throw new Error('Missing SePay OAuth state signing secret');
  }

  return secret;
}

function signSepayOauthStatePayload(payload: string) {
  return createHmac('sha256', getSepayOauthStateSigningSecret())
    .update(payload)
    .digest('base64url');
}

function encodeSepayOauthStatePayload(payload: SepayOauthStatePayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeSepayOauthStatePayload(
  encodedPayload: string
): SepayOauthStatePayload | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<SepayOauthStatePayload>;

    if (
      decoded.version !== SEPAY_OAUTH_STATE_VERSION ||
      typeof decoded.wsId !== 'string' ||
      typeof decoded.nonce !== 'string' ||
      typeof decoded.expiresAt !== 'number'
    ) {
      return null;
    }

    return {
      expiresAt: decoded.expiresAt,
      nonce: decoded.nonce,
      version: decoded.version,
      wsId: decoded.wsId,
    };
  } catch {
    return null;
  }
}

export function getSepayOauthEnv() {
  return {
    authorizeUrl:
      process.env.SEPAY_OAUTH_AUTHORIZE_URL ??
      'https://my.sepay.vn/oauth/authorize',
    clientId: process.env.SEPAY_OAUTH_CLIENT_ID ?? null,
    clientSecret: process.env.SEPAY_OAUTH_CLIENT_SECRET ?? null,
  };
}

export function getSepayOauthStateCookieName(wsId: string) {
  const suffix = Buffer.from(wsId, 'utf8').toString('base64url');
  return `${SEPAY_OAUTH_STATE_COOKIE_PREFIX}${suffix}`;
}

export function getSepayOauthStateMaxAgeSeconds(ttlMs?: number) {
  return Math.max(1, Math.ceil((ttlMs ?? DEFAULT_STATE_TTL_MS) / 1000));
}

export function createSepayOauthState(input: { ttlMs?: number; wsId: string }) {
  const payload = encodeSepayOauthStatePayload({
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_STATE_TTL_MS),
    nonce: randomBytes(32).toString('base64url'),
    version: SEPAY_OAUTH_STATE_VERSION,
    wsId: input.wsId,
  });
  const signature = signSepayOauthStatePayload(payload);

  return {
    state: `${payload}.${signature}`,
  };
}

export function verifySepayOauthState(input: {
  expectedState: string | null | undefined;
  state: string;
  wsId: string;
}) {
  if (!input.expectedState) {
    return { ok: false as const };
  }

  if (!safeEquals(input.state, input.expectedState)) {
    return { ok: false as const };
  }

  const [payload, signature, ...rest] = input.state.split('.');
  if (!payload || !signature || rest.length > 0) {
    return { ok: false as const };
  }

  let expectedSignature: string;
  try {
    expectedSignature = signSepayOauthStatePayload(payload);
  } catch {
    return { ok: false as const };
  }

  if (!safeEquals(signature, expectedSignature)) {
    return { ok: false as const };
  }

  const decodedPayload = decodeSepayOauthStatePayload(payload);
  if (!decodedPayload) {
    return { ok: false as const };
  }

  if (decodedPayload.wsId !== input.wsId) {
    return { ok: false as const };
  }

  if (decodedPayload.expiresAt <= Date.now()) {
    return { ok: false as const };
  }

  return { ok: true as const };
}

export function buildSepayOauthAuthorizeUrl(input: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
}) {
  const url = new URL(input.authorizeUrl);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);

  if (input.scope) {
    url.searchParams.set('scope', input.scope);
  }

  return url.toString();
}
