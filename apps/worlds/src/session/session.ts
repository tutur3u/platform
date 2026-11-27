import { createHash, randomBytes } from 'node:crypto';
import {
  APP_REDEEM_PROOF_HEADER,
  createAppRedeemProof,
} from '@tuturuuu/auth/app-redeem-proof';
import {
  APP_LOGOUT_COOKIE_NAME,
  hasAppLogoutFence,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import { isActorId, isRecord } from '../multiplayer/admission.ts';

const TARGET = 'worlds';
const WEB_ORIGIN = 'https://tuturuuu.com';
const STATE_COOKIE = '__Host-worlds_login_state';
export const WORLDS_SESSION_COOKIE = '__Host-worlds_session';

type SessionEnv = {
  WORLDS_VIEWER_ORIGIN?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
};

function readCookie(request: Request, name: string) {
  const matches = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

export function resolveWorldsSession(
  request: Request,
  secret: string,
  now: number
) {
  const token = readCookie(request, WORLDS_SESSION_COOKIE);
  if (!token || hasAppLogoutFence(request)) return null;
  try {
    const result = verifyAppSessionToken(token, {
      targetApp: TARGET,
      secret,
      now: new Date(now),
    });
    if (!result.ok) return null;
    const { sub, exp, iat } = result.claims;
    if (!isActorId(sub) || iat * 1000 > now || exp * 1000 <= now) return null;
    return { id: sub, sessionExpiresAt: exp };
  } catch {
    return null;
  }
}

function privateHeaders() {
  return new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
}

function setCookie(
  headers: Headers,
  name: string,
  value: string,
  maxAge: number
) {
  headers.append(
    'Set-Cookie',
    `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );
}

export async function handleWorldsSession(request: Request, env: SessionEnv) {
  const url = new URL(request.url);
  const headers = privateHeaders();
  const reject = (status: number) => new Response(null, { status, headers });
  const redirect = (location: string) => {
    headers.set('Location', location);
    return reject(303);
  };
  const origin = request.headers.get('Origin');
  if (
    url.origin !== env.WORLDS_VIEWER_ORIGIN ||
    (origin !== null && origin !== url.origin)
  )
    return reject(403);
  if (request.method !== 'GET') return reject(405);
  if (request.headers.has('purpose') || request.headers.has('sec-purpose'))
    return reject(403);
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET?.trim();
  if (!secret) return reject(503);

  if (url.pathname === '/login') {
    const nonce = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const next = new URL('/', url.origin);
    next.searchParams.set('state', nonce);
    next.searchParams.set(
      'lang',
      url.searchParams.get('lang') === 'vi' ? 'vi' : 'en'
    );
    const callback = new URL('/verify-token', url.origin);
    callback.searchParams.set('nextUrl', next.pathname + next.search);
    const login = new URL('/api/v1/auth/cross-app-return', WEB_ORIGIN);
    login.searchParams.set('returnUrl', callback.href);
    login.searchParams.set(
      'code_challenge',
      createHash('sha256').update(verifier).digest('base64url')
    );
    login.searchParams.set('code_challenge_method', 'S256');
    setCookie(headers, STATE_COOKIE, `${nonce}.${verifier}`, 600);
    return redirect(login.href);
  }

  const token = url.searchParams.get('token');
  const nextPath = url.searchParams.get('nextUrl');
  const next =
    nextPath && /^\/\?[^#]*$/.test(nextPath)
      ? new URL(nextPath, url.origin)
      : null;
  const [nonce, verifier, extra] = (
    readCookie(request, STATE_COOKIE) ?? ''
  ).split('.');
  if (
    !token ||
    !/^[a-f0-9]{64}$/.test(token) ||
    url.searchParams.get('targetApp') !== TARGET ||
    !nonce ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce) ||
    !verifier ||
    !/^[A-Za-z0-9_-]{43}$/.test(verifier) ||
    extra !== undefined ||
    !next ||
    next.searchParams.get('state') !== nonce
  )
    return reject(401);

  setCookie(headers, STATE_COOKIE, '', 0);
  try {
    const response = await fetch(
      new Request(new URL('/api/v1/auth/cross-app-token/verify', WEB_ORIGIN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [APP_REDEEM_PROOF_HEADER]: createAppRedeemProof(
            TARGET,
            token,
            secret
          ),
        },
        body: JSON.stringify({
          targetApp: TARGET,
          token,
          codeVerifier: verifier,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      })
    );
    if (!response.ok) return reject(response.status >= 500 ? 503 : 401);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      body.valid !== true ||
      typeof body.appSessionToken !== 'string'
    )
      return reject(401);
    const now = Date.now();
    const session = verifyAppSessionToken(body.appSessionToken, {
      targetApp: TARGET,
      secret,
      now: new Date(now),
    });
    if (
      !session.ok ||
      session.claims.sub !== body.userId ||
      !isActorId(session.claims.sub) ||
      session.claims.iat * 1000 > now ||
      session.claims.exp * 1000 <= now
    )
      return reject(401);
    setCookie(
      headers,
      WORLDS_SESSION_COOKIE,
      body.appSessionToken,
      session.claims.exp - Math.floor(now / 1000)
    );
    setCookie(headers, APP_LOGOUT_COOKIE_NAME, '', 0);
    return redirect(next.searchParams.get('lang') === 'vi' ? '/?lang=vi' : '/');
  } catch {
    return reject(503);
  }
}
