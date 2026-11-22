import {
  APP_REDEEM_PROOF_HEADER,
  createAppRedeemProof,
  createMastermindLoginTransaction,
  MASTERMIND_FRESH_MFA_SECONDS,
  MASTERMIND_LOGIN_TRANSACTION_PARAM,
  MASTERMIND_LOGIN_TRANSACTION_SECONDS,
} from '@tuturuuu/auth/app-redeem-proof';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import { z } from 'zod';
import { isOwnerEmail, type MastermindEnvironment, ownerIds } from './auth';
import { legacyDefaultLocalePath } from './locale-path';
import { hasLiveFleetGrant } from './permission';

/**
 * Satellite session issuance for the dedicated host, following the central
 * login handoff every registered satellite uses: `/login` sends the owner to
 * `tuturuuu.com/login` with a return to `/verify-token`, Web mints a
 * single-use cross-app token for target `mastermind`, and this Worker
 * exchanges it for a 300-second access session and a refresh credential,
 * both host-only `HttpOnly` cookies. The signed session, from those cookies
 * or a Bearer credential for target `mastermind`, is the only identity; no
 * unsigned header names the user. An owner id must carry the
 * owner email; any other subject needs a live Fleet grant at issuance and at
 * every refresh, and a refresh renews only its own subject.
 */
export const MASTERMIND_ORIGIN = 'https://mastermind.tuturuuu.com';
const WEB_ORIGIN = 'https://tuturuuu.com';
const TARGET = 'mastermind';
const MAX_ACCESS_SECONDS = 300;
const MAX_REFRESH_SECONDS = 86_400;

/**
 * A same-host path to return to; anything else falls back to `/`. A legacy
 * `/en` path returns to its unprefixed form.
 */
export function safeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.includes('\\') || /[\u0000-\u001f]/u.test(raw)) return '/';
  const url = new URL(raw, MASTERMIND_ORIGIN);
  if (url.origin !== MASTERMIND_ORIGIN) return '/';
  // Dot segments can normalize into `//host`, a protocol-relative Location.
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//'))
    return '/';
  if (['/login', '/verify-token'].includes(url.pathname)) return '/';
  const pathname = legacyDefaultLocalePath(url.pathname) ?? url.pathname;
  return `${pathname}${url.search}`;
}

/**
 * Login state: `/login` sets a random nonce and a PKCE verifier in a
 * `__Host-` cookie, which no sibling subdomain can plant, carries the nonce
 * inside the return path (Web keeps only `nextUrl` across the handoff) and
 * sends Web the verifier's S256 challenge, which Web binds to the handoff.
 * `/verify-token` accepts a handoff only when the nonce matches, so a handoff
 * started in another browser cannot replace this browser's session, and
 * redeems it with the verifier, so a handoff URL copied from history or logs
 * cannot be redeemed from another browser.
 */
export const LOGIN_STATE_COOKIE = '__Host-mastermind_login_state';
export const LOGIN_STATE_PARAM = 'mm_state';
const LOGIN_STATE_SECONDS = MASTERMIND_LOGIN_TRANSACTION_SECONDS;

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64url(new Uint8Array(digest));
}

/** A 43-character verifier, the RFC 7636 minimum, from 32 random bytes. */
const PKCE_VERIFIER = /^[A-Za-z0-9_-]{43}$/;
const LOGIN_NONCE = /^[A-Za-z0-9_-]{22}$/;

/**
 * How old a second-factor proof may be when Web hands the session back after
 * a step-up, in seconds: in practice, verified during that sign-in. Web
 * judges the proof's age again, against its own window, when a reply is sent.
 */
export const FRESH_MFA_MAX_AGE_SECONDS = MASTERMIND_FRESH_MFA_SECONDS;

/**
 * Whether the browser carries a Tuturuuu session cookie on the shared
 * domain. It is only a routing hint, never identity: Web verifies the
 * session itself and falls back to its sign-in page.
 */
const CENTRAL_SESSION_COOKIE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;
export function hasCentralSessionHint(request: Request) {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .some((part) =>
      CENTRAL_SESSION_COOKIE.test(part.trim().split('=')[0] ?? '')
    );
}

/** Web's signed-in continue: mints server-side, else answers `/login`. */
const WEB_CONTINUE_PATH = '/api/v1/auth/cross-app-return';

/**
 * Sends the browser to the Web sign-in, to return through `/verify-token`.
 * With `freshMfa`, Web hands back a session only once its second factor was
 * verified within the last `FRESH_MFA_MAX_AGE_SECONDS`, asking for it again
 * when the session's own proof is older. With `signedIn` (a central session
 * cookie is present) the browser goes to Web's signed-in continue instead,
 * which returns straight here when that session is enough and otherwise
 * shows the same sign-in page.
 */
export async function loginRedirect(
  nextPath: string,
  env: MastermindEnvironment,
  {
    freshMfa = false,
    chooseAccount = false,
    signedIn = false,
  }: { freshMfa?: boolean; chooseAccount?: boolean; signedIn?: boolean } = {},
  now = Date.now()
) {
  // Signed transactions start only once Web can claim them (its replay store
  // serves): until then Web answers a transaction it cannot claim with 503.
  const signTransaction = env.MASTERMIND_SIGNIN_TRANSACTION === 'true';
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET?.trim();
  if (signTransaction && !secret)
    return new Response('Sign-in unavailable', { status: 503 });
  const state = randomToken(16);
  const verifier = randomToken(32);
  const next = new URL(safeNextPath(nextPath), MASTERMIND_ORIGIN);
  next.searchParams.set(LOGIN_STATE_PARAM, state);
  const verify = new URL('/verify-token', MASTERMIND_ORIGIN);
  verify.searchParams.set('nextUrl', `${next.pathname}${next.search}`);
  // A step-up or an account choice needs the sign-in page itself.
  const login = new URL(
    signedIn && !freshMfa && !chooseAccount ? WEB_CONTINUE_PATH : '/login',
    WEB_ORIGIN
  );
  const challenge = await pkceChallenge(verifier);
  if (signTransaction && secret)
    verify.searchParams.set(
      MASTERMIND_LOGIN_TRANSACTION_PARAM,
      createMastermindLoginTransaction(verify, challenge, freshMfa, secret, now)
    );
  login.searchParams.set('returnUrl', verify.toString());
  if (freshMfa)
    login.searchParams.set('mfaMaxAge', String(FRESH_MFA_MAX_AGE_SECONDS));
  // Web shows its account picker instead of continuing as the current one.
  if (chooseAccount) login.searchParams.set('confirmAccount', '1');
  login.searchParams.set('code_challenge', challenge);
  login.searchParams.set('code_challenge_method', 'S256');
  const headers = new Headers({ Location: login.toString() });
  headers.append(
    'Set-Cookie',
    `${LOGIN_STATE_COOKIE}=${state}.${verifier}; Path=/; Max-Age=${LOGIN_STATE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { status: 303, headers });
}

/** Clears the one-use login state after a callback. */
export const CLEAR_LOGIN_STATE = `${LOGIN_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/**
 * The callback's return path without its login state, and this browser's
 * PKCE verifier, or null when the state is missing or does not match this
 * browser's cookie.
 */
export function consumeLoginState(request: Request, rawNext: string | null) {
  const cookie = readCookie(request, LOGIN_STATE_COOKIE);
  const [nonce = '', verifier = '', ...rest] = (cookie ?? '').split('.');
  if (rest.length || !LOGIN_NONCE.test(nonce) || !PKCE_VERIFIER.test(verifier))
    return null;
  const next = new URL(safeNextPath(rawNext), MASTERMIND_ORIGIN);
  const state = next.searchParams.get(LOGIN_STATE_PARAM);
  if (!state || !sameString(nonce, state)) return null;
  next.searchParams.delete(LOGIN_STATE_PARAM);
  return { next: safeNextPath(`${next.pathname}${next.search}`), verifier };
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++)
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Web's handoff token: 32 random bytes, hex. Anything else costs no call. */
export function isHandoffToken(token: string | null): token is string {
  return !!token && /^[0-9a-f]{64}$/.test(token);
}

const sessionResponse = z.object({
  valid: z.literal(true),
  userId: z.string().min(1),
  appSessionToken: z.string().min(1),
  appSessionExpiresAt: z.string().min(1),
  appSessionRefreshToken: z.string().min(1),
  appSessionRefreshExpiresAt: z.string().min(1),
});

export interface IssuedSession {
  userId: string;
  access: string;
  accessExpiresAt: Date;
  refresh: string;
  refreshExpiresAt: Date;
}

/**
 * An owner id holds a session only with the owner email. Any other subject
 * may hold one only while its Fleet grant is live, checked by the caller.
 */
function mayHoldSession(
  env: MastermindEnvironment,
  claims: { sub: string; email?: string | null }
) {
  return ownerIds(env).includes(claims.sub)
    ? isOwnerEmail(env, claims.email ?? '')
    : true;
}

/**
 * Accepts a Web session response only when both credentials verify locally
 * for target `mastermind`, name the same subject (the refreshing subject on a
 * refresh), and the access session lives at most 300 seconds. An owner id
 * must carry the owner email; any other subject needs a live Fleet grant.
 */
async function acceptSession(
  body: unknown,
  env: MastermindEnvironment,
  now: number,
  fetcher: typeof fetch,
  expectedSubject?: string
): Promise<IssuedSession | null> {
  const parsed = sessionResponse.safeParse(body);
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET;
  if (!parsed.success || !secret) return null;
  const options = { secret, targetApp: TARGET, now: new Date(now) };
  const access = verifyAppSessionToken(parsed.data.appSessionToken, options);
  const refresh = verifyAppSessionRefreshToken(
    parsed.data.appSessionRefreshToken,
    options
  );
  if (!access.ok || !refresh.ok) return null;
  const { claims } = access;
  if (
    claims.sub !== parsed.data.userId ||
    refresh.claims.sub !== claims.sub ||
    (expectedSubject !== undefined && claims.sub !== expectedSubject) ||
    claims.exp - claims.iat > MAX_ACCESS_SECONDS ||
    refresh.claims.exp - refresh.claims.iat > MAX_REFRESH_SECONDS ||
    !mayHoldSession(env, claims)
  )
    return null;
  if (
    !ownerIds(env).includes(claims.sub) &&
    !(await hasLiveFleetGrant(parsed.data.appSessionToken, fetcher))
  )
    return null;
  return {
    userId: claims.sub,
    access: parsed.data.appSessionToken,
    accessExpiresAt: new Date(claims.exp * 1000),
    refresh: parsed.data.appSessionRefreshToken,
    refreshExpiresAt: new Date(refresh.claims.exp * 1000),
  };
}

/**
 * Calls a Web session route with the Worker-only redeem proof for the
 * credential: Web refuses a mastermind handoff or refresh without it.
 */
async function postWeb(
  path: string,
  body: { targetApp: string } & Record<string, string>,
  credential: string,
  env: MastermindEnvironment,
  fetcher: typeof fetch
) {
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET;
  if (!secret) return null;
  const response = await fetcher(
    new Request(`${WEB_ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [APP_REDEEM_PROOF_HEADER]: createAppRedeemProof(
          TARGET,
          credential,
          secret
        ),
      },
      body: JSON.stringify(body),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  );
  if (
    String(response.type) === 'opaqueredirect' ||
    response.status >= 300 ||
    response.status < 200
  )
    return null;
  return response.json().catch(() => null);
}

/**
 * Exchanges the single-use handoff token from `tuturuuu.com/login` with the
 * verifier of the browser that started the sign-in.
 */
export async function exchangeHandoff(
  token: string,
  codeVerifier: string,
  env: MastermindEnvironment,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  issuerProof?: string
) {
  try {
    const body = await postWeb(
      '/api/v1/auth/cross-app-token/verify',
      {
        targetApp: TARGET,
        token,
        codeVerifier,
        ...(issuerProof ? { issuerProof } : {}),
      },
      token,
      env,
      fetcher
    );
    return body ? await acceptSession(body, env, now, fetcher) : null;
  } catch {
    return null;
  }
}

/** Rotates the refresh credential for a new access session. */
export async function refreshSession(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now(),
  fetcher: typeof fetch = fetch
) {
  const refreshToken = readCookie(
    hostSessionRequest(request),
    APP_SESSION_REFRESH_COOKIE_NAME
  );
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET;
  if (!refreshToken || !secret) return null;
  const local = verifyAppSessionRefreshToken(refreshToken, {
    secret,
    targetApp: TARGET,
    now: new Date(now),
  });
  if (!local.ok || !mayHoldSession(env, local.claims)) return null;
  try {
    const body = await postWeb(
      '/api/v1/auth/cross-app-session/refresh',
      { targetApp: TARGET, refreshToken },
      refreshToken,
      env,
      fetcher
    );
    return body
      ? await acceptSession(body, env, now, fetcher, local.claims.sub)
      : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

/**
 * The browser holds the session under `__Host-` names, which no sibling
 * `*.tuturuuu.com` host can set. The shared names are what the auth core
 * reads, so only the Worker maps one onto the other.
 */
export const HOST_SESSION_COOKIE = '__Host-mastermind_session';
export const HOST_REFRESH_COOKIE = '__Host-mastermind_refresh';
const SHARED_SESSION_COOKIES = new Set([
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
]);

/**
 * The request with shared-name session cookies dropped, since a sibling host
 * could plant them, and this host's `__Host-` cookies under the names the
 * auth core reads.
 */
const mapped = new WeakSet<Request>();
export function hostSessionRequest(request: Request) {
  const raw = request.headers.get('cookie');
  if (!raw || mapped.has(request)) return request;
  const renamed: Record<string, string> = {
    [HOST_SESSION_COOKIE]: APP_SESSION_COOKIE_NAME,
    [HOST_REFRESH_COOKIE]: APP_SESSION_REFRESH_COOKIE_NAME,
  };
  const parts = raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [key = '', ...value] = part.split('=');
      if (SHARED_SESSION_COOKIES.has(key)) return [];
      const name = renamed[key];
      return [name ? `${name}=${value.join('=')}` : part];
    });
  const headers = new Headers(request.headers);
  if (parts.length) headers.set('cookie', parts.join('; '));
  else headers.delete('cookie');
  const next = new Request(request, { headers });
  mapped.add(next);
  return next;
}

/** Host-only, Secure, HttpOnly, SameSite=Lax session cookies. */
export function sessionCookies(session: IssuedSession) {
  const cookie = (name: string, value: string, expires: Date) =>
    `${name}=${value}; Path=/; Expires=${expires.toUTCString()}; HttpOnly; Secure; SameSite=Lax`;
  return [
    cookie(HOST_SESSION_COOKIE, session.access, session.accessExpiresAt),
    cookie(HOST_REFRESH_COOKIE, session.refresh, session.refreshExpiresAt),
  ];
}

/** Expires both session cookies so the next visit signs in again. */
export function clearedSessionCookies() {
  return [HOST_SESSION_COOKIE, HOST_REFRESH_COOKIE].map(
    (name) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  );
}

/** The request as if it had arrived with the new access session. */
export function withSessionCookie(request: Request, session: IssuedSession) {
  const others = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !part.startsWith(`${APP_SESSION_COOKIE_NAME}=`) &&
        !part.startsWith(`${APP_SESSION_REFRESH_COOKIE_NAME}=`)
    );
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  headers.set(
    'cookie',
    [...others, `${APP_SESSION_COOKIE_NAME}=${session.access}`].join('; ')
  );
  return new Request(request, { headers });
}
