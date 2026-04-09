import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

type SepayOauthStatePayload = {
  exp: number;
  nonce: string;
  wsId: string;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function signStatePayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getSepayOauthEnv() {
  return {
    authorizeUrl:
      process.env.SEPAY_OAUTH_AUTHORIZE_URL ??
      'https://my.sepay.vn/oauth/authorize',
    clientId: process.env.SEPAY_OAUTH_CLIENT_ID ?? null,
    stateSecret: process.env.SEPAY_OAUTH_STATE_SECRET ?? null,
  };
}

export function createSepayOauthState(input: {
  secret: string;
  ttlMs?: number;
  wsId: string;
}) {
  const now = Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_STATE_TTL_MS;
  const payload: SepayOauthStatePayload = {
    exp: now + ttlMs,
    nonce: randomBytes(12).toString('hex'),
    wsId: input.wsId,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload, input.secret);

  return {
    expiresAt: new Date(payload.exp).toISOString(),
    state: `${encodedPayload}.${signature}`,
  };
}

export function verifySepayOauthState(input: {
  secret: string;
  state: string;
}) {
  const parts = input.state.split('.');
  if (parts.length !== 2) {
    return { ok: false as const };
  }

  const encodedPayload = parts[0];
  const providedSignature = parts[1];

  if (!encodedPayload || !providedSignature) {
    return { ok: false as const };
  }

  const expectedSignature = signStatePayload(encodedPayload, input.secret);
  if (!safeEquals(providedSignature, expectedSignature)) {
    return { ok: false as const };
  }

  const decoded = base64UrlDecode(encodedPayload);
  if (!decoded) {
    return { ok: false as const };
  }

  let parsed: SepayOauthStatePayload;
  try {
    parsed = JSON.parse(decoded) as SepayOauthStatePayload;
  } catch {
    return { ok: false as const };
  }

  if (!parsed.wsId || typeof parsed.wsId !== 'string') {
    return { ok: false as const };
  }

  if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    wsId: parsed.wsId,
  };
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
