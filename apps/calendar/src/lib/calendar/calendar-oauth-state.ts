import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const STATE_VERSION = 1;
const STATE_TTL_MS = 10 * 60 * 1000;

export type CalendarOAuthProvider = 'google' | 'microsoft';

type CalendarOAuthStatePayload = {
  v: typeof STATE_VERSION;
  p: CalendarOAuthProvider;
  ws: string;
  uid: string;
  exp: number;
  n: string;
};

export type CalendarOAuthStateVerification =
  | {
      ok: true;
      expiresAt: number;
      nonce: string;
      userId: string;
      wsId: string;
    }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

// Derive a purpose-bound key so the provider client secret is never used
// directly as a MAC key, and a state minted for one provider never verifies
// for another.
function stateKey(provider: CalendarOAuthProvider, clientSecret: string) {
  return createHmac('sha256', clientSecret)
    .update(`tuturuuu.calendar.${provider}-oauth-state.v${STATE_VERSION}`)
    .digest();
}

function sign(
  provider: CalendarOAuthProvider,
  content: string,
  clientSecret: string
) {
  return createHmac('sha256', stateKey(provider, clientSecret))
    .update(content)
    .digest('base64url');
}

/**
 * Derive the PKCE (S256) pair for a flow from its signed state nonce. The
 * verifier is keyed by the server-only state key, so it never travels to the
 * browser and cannot be computed from the state alone.
 */
export function deriveCalendarOAuthPkce(
  provider: CalendarOAuthProvider,
  nonce: string,
  clientSecret: string
) {
  const codeVerifier = createHmac('sha256', stateKey(provider, clientSecret))
    .update(`pkce:${nonce}`)
    .digest('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeChallenge, codeVerifier };
}

/**
 * Create the OAuth `state` for a calendar provider connection. It binds the
 * flow to the initiating user and workspace, expires, and is signed so the
 * callback can reject forged or swapped values. The returned nonce is unique
 * per flow and is consumed once by the callback.
 */
export function createCalendarOAuthState(
  provider: CalendarOAuthProvider,
  input: { userId: string; wsId: string },
  clientSecret: string,
  now = Date.now()
) {
  const payload: CalendarOAuthStatePayload = {
    v: STATE_VERSION,
    p: provider,
    ws: input.wsId,
    uid: input.userId,
    exp: now + STATE_TTL_MS,
    n: randomBytes(16).toString('base64url'),
  };
  const content = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return {
    expiresAt: payload.exp,
    nonce: payload.n,
    state: `${content}.${sign(provider, content, clientSecret)}`,
  };
}

function isPayload(
  value: unknown,
  provider: CalendarOAuthProvider
): value is CalendarOAuthStatePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CalendarOAuthStatePayload>;

  return (
    payload.v === STATE_VERSION &&
    payload.p === provider &&
    typeof payload.ws === 'string' &&
    payload.ws.length > 0 &&
    typeof payload.uid === 'string' &&
    payload.uid.length > 0 &&
    typeof payload.exp === 'number' &&
    typeof payload.n === 'string' &&
    payload.n.length > 0
  );
}

export function verifyCalendarOAuthState(
  provider: CalendarOAuthProvider,
  state: string | null | undefined,
  clientSecret: string,
  now = Date.now()
): CalendarOAuthStateVerification {
  const [content, signature, extra] = state?.split('.') ?? [];

  if (!content || !signature || extra !== undefined) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = Buffer.from(sign(provider, content, clientSecret));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'signature' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(content, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!isPayload(payload, provider)) {
    return { ok: false, reason: 'malformed' };
  }

  if (payload.exp <= now) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    expiresAt: payload.exp,
    nonce: payload.n,
    userId: payload.uid,
    wsId: payload.ws,
  };
}
