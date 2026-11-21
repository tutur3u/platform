import {
  APP_REDEEM_PROOF_HEADER,
  createAppRedeemProof,
} from '@tuturuuu/auth/app-redeem-proof';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import { z } from 'zod';
import { type MastermindEnvironment, ownerIds } from './auth';

/**
 * Satellite session issuance for the dedicated host, following the central
 * login handoff every registered satellite uses: `/login` sends the owner to
 * `tuturuuu.com/login` with a return to `/verify-token`, Web mints a
 * single-use cross-app token for target `mastermind`, and this Worker
 * exchanges it for a 300-second access session and a refresh credential,
 * both host-only `HttpOnly` cookies. Every step runs behind Cloudflare
 * Access and requires the Access email; issuance also requires the
 * allowlisted owner id.
 */
export const MASTERMIND_ORIGIN = 'https://mastermind.tuturuuu.com';
const WEB_ORIGIN = 'https://tuturuuu.com';
const TARGET = 'mastermind';
const MAX_ACCESS_SECONDS = 300;
const MAX_REFRESH_SECONDS = 86_400;

/** A same-host path to return to; anything else falls back to `/en`. */
export function safeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/en';
  if (raw.includes('\\') || /[\u0000-\u001f]/u.test(raw)) return '/en';
  const url = new URL(raw, MASTERMIND_ORIGIN);
  if (url.origin !== MASTERMIND_ORIGIN) return '/en';
  // Dot segments can normalize into `//host`, a protocol-relative Location.
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//'))
    return '/en';
  if (['/login', '/verify-token'].includes(url.pathname)) return '/en';
  return `${url.pathname}${url.search}`;
}

export function loginRedirect(nextPath: string) {
  const verify = new URL('/verify-token', MASTERMIND_ORIGIN);
  verify.searchParams.set('nextUrl', safeNextPath(nextPath));
  const login = new URL('/login', WEB_ORIGIN);
  login.searchParams.set('returnUrl', verify.toString());
  return new Response(null, {
    status: 303,
    headers: { Location: login.toString() },
  });
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
 * Accepts a Web session response only when both credentials verify locally
 * for target `mastermind`, belong to an allowlisted owner with the Access
 * email, and the access session lives at most 300 seconds.
 */
function acceptSession(
  body: unknown,
  env: MastermindEnvironment,
  email: string,
  now: number
): IssuedSession | null {
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
    claims.email !== email ||
    claims.exp - claims.iat > MAX_ACCESS_SECONDS ||
    refresh.claims.exp - refresh.claims.iat > MAX_REFRESH_SECONDS ||
    !ownerIds(env).includes(claims.sub)
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

/** Exchanges the single-use handoff token from `tuturuuu.com/login`. */
export async function exchangeHandoff(
  token: string,
  env: MastermindEnvironment,
  email: string,
  now = Date.now(),
  fetcher: typeof fetch = fetch
) {
  try {
    const body = await postWeb(
      '/api/v1/auth/cross-app-token/verify',
      { targetApp: TARGET, token },
      token,
      env,
      fetcher
    );
    return body ? acceptSession(body, env, email, now) : null;
  } catch {
    return null;
  }
}

/** Rotates the refresh credential for a new access session. */
export async function refreshSession(
  request: Request,
  env: MastermindEnvironment,
  email: string,
  now = Date.now(),
  fetcher: typeof fetch = fetch
) {
  const refreshToken = readCookie(request, APP_SESSION_REFRESH_COOKIE_NAME);
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET;
  if (!refreshToken || !secret) return null;
  const local = verifyAppSessionRefreshToken(refreshToken, {
    secret,
    targetApp: TARGET,
    now: new Date(now),
  });
  if (!local.ok || !ownerIds(env).includes(local.claims.sub)) return null;
  try {
    const body = await postWeb(
      '/api/v1/auth/cross-app-session/refresh',
      { targetApp: TARGET, refreshToken },
      refreshToken,
      env,
      fetcher
    );
    return body ? acceptSession(body, env, email, now) : null;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

/** Host-only, Secure, HttpOnly, SameSite=Lax session cookies. */
export function sessionCookies(session: IssuedSession) {
  const cookie = (name: string, value: string, expires: Date) =>
    `${name}=${value}; Path=/; Expires=${expires.toUTCString()}; HttpOnly; Secure; SameSite=Lax`;
  return [
    cookie(APP_SESSION_COOKIE_NAME, session.access, session.accessExpiresAt),
    cookie(
      APP_SESSION_REFRESH_COOKIE_NAME,
      session.refresh,
      session.refreshExpiresAt
    ),
  ];
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
