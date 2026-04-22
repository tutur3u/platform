import { randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const SEPAY_OAUTH_STATE_COOKIE_PREFIX = 'sepay_oauth_state_';

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
  };
}

export function getSepayOauthStateCookieName(wsId: string) {
  const suffix = Buffer.from(wsId, 'utf8').toString('base64url');
  return `${SEPAY_OAUTH_STATE_COOKIE_PREFIX}${suffix}`;
}

export function getSepayOauthStateMaxAgeSeconds(ttlMs?: number) {
  return Math.max(1, Math.ceil((ttlMs ?? DEFAULT_STATE_TTL_MS) / 1000));
}

export function createSepayOauthState() {
  return {
    state: randomBytes(32).toString('base64url'),
  };
}

export function verifySepayOauthState(input: {
  expectedState: string | null | undefined;
  state: string;
}) {
  if (!input.expectedState) {
    return { ok: false as const };
  }

  if (!safeEquals(input.state, input.expectedState)) {
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
