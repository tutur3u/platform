import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getSepayWebhookAuthSecret } from './sepay';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const SEPAY_OAUTH_STATE_COOKIE_PREFIX = 'sepay_oauth_state_';
const SEPAY_OAUTH_STATE_VERSION = 1;
const stateEncoder = new TextEncoder();

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
  return (
    process.env.SEPAY_OAUTH_STATE_SECRET ??
    process.env.SEPAY_OAUTH_CLIENT_SECRET
  );
}

function importSepayOauthStateKey(usage: 'sign' | 'verify') {
  const signingKey = getSepayOauthStateSigningSecret();
  if (!signingKey?.trim()) {
    throw new Error('Missing SePay OAuth state signing secret');
  }
  return crypto.subtle.importKey(
    'raw',
    stateEncoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
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
  const {
    SEPAY_OAUTH_CLIENT_ID: clientId,
    SEPAY_OAUTH_CLIENT_SECRET: clientSecret,
  } = process.env;
  if (
    !clientId?.trim() ||
    !clientSecret?.trim() ||
    !getSepayOauthStateSigningSecret()?.trim() ||
    !process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET?.trim() ||
    !getSepayWebhookAuthSecret()?.trim()
  ) {
    return null;
  }
  return {
    authorizeUrl:
      process.env.SEPAY_OAUTH_AUTHORIZE_URL ??
      'https://my.sepay.vn/oauth/authorize',
    clientId,
  };
}

export function getSepayOauthStateCookieName(wsId: string) {
  const suffix = Buffer.from(wsId, 'utf8').toString('base64url');
  return `${SEPAY_OAUTH_STATE_COOKIE_PREFIX}${suffix}`;
}

export function getSepayOauthStateMaxAgeSeconds(ttlMs?: number) {
  return Math.max(1, Math.ceil((ttlMs ?? DEFAULT_STATE_TTL_MS) / 1000));
}

export async function createSepayOauthState(input: {
  ttlMs?: number;
  wsId: string;
}) {
  const payload = encodeSepayOauthStatePayload({
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_STATE_TTL_MS),
    nonce: randomBytes(32).toString('base64url'),
    version: SEPAY_OAUTH_STATE_VERSION,
    wsId: input.wsId,
  });
  const key = await importSepayOauthStateKey('sign');
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    stateEncoder.encode(payload)
  );

  return {
    state: `${payload}.${Buffer.from(signature).toString('base64url')}`,
  };
}

export async function verifySepayOauthState(input: {
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

  const mac = Buffer.from(signature, 'base64url');
  if (mac.toString('base64url') !== signature) {
    return { ok: false as const };
  }

  try {
    const key = await importSepayOauthStateKey('verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      mac,
      stateEncoder.encode(payload)
    );
    if (!valid) return { ok: false as const };
  } catch {
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
