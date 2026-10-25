import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  enforceRequiredMfa: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: (...args: unknown[]) => mocks.updateSession(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: (...args: unknown[]) =>
    mocks.enforceRequiredMfa(...args),
}));
vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: async () => ({ status: 'allowed' }),
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaProofAllowed: async () => true,
}));

import { createAppSessionTokenPair } from '@tuturuuu/auth/app-session';
import { createPOST, createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { createCentralizedAuthProxy } from '@tuturuuu/auth/proxy';
import { cookies } from '../server/request-context';
import { createBridgeHandler } from './handler';

const APP_SESSION_COOKIE = /^tuturuuu_(?:web_)?app_session(?:_refresh)?=/u;
const SUPABASE_COOKIE = 'sb-project-auth-token';
const ROOT = 'https://meet.tuturuuu.com';
const MOUNTED = 'https://tuturuuu.com/meet';
const ctx = { waitUntil: vi.fn() };

const verifier = vi.fn(async (input: RequestInfo | URL) =>
  String(input).endsWith('/cross-app-session/refresh')
    ? Response.json({
        appSessionRefreshToken: 'ttr_app_rotated-refresh',
        appSessionToken: 'ttr_app_rotated',
        userId: 'user-1',
        valid: true,
      })
    : Response.json({ sessionData: { email: 'a@x.test' }, userId: 'user-1' })
);
const ownApi = vi.fn(
  async (request: Request) =>
    new Response(request.headers.has('authorization') ? 'bearer' : 'none')
);
const start = vi.fn(async () => {
  // App code writing the session cookie directly, bypassing the writers.
  (await cookies()).set('tuturuuu_app_session', 'raw', { path: '/' });
  return new Response('page');
});

const authProxy = createCentralizedAuthProxy({
  webAppUrl: 'https://tuturuuu.com',
  appSession: { targetApp: 'meet', sessionMode: 'supabase-first' },
});
const handle = createBridgeHandler({
  mounts: {
    app: 'meet',
    rootHosts: ['meet.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/meet',
  },
  start: { fetch: start },
  // Like the satellites' proxy.ts: the handshake routes run unauthenticated.
  proxy: async (request) =>
    /^\/api\/(?:auth|custom)\//u.test(request.nextUrl.pathname)
      ? NextResponse.next()
      : authProxy(request),
  endpoints: [
    {
      pattern: '/api/auth/verify-app-token',
      module: {
        POST: createPOST('meet', {
          verificationBaseUrl: 'https://tuturuuu.com',
        }),
      },
    },
    {
      pattern: '/api/auth/refresh-app-session',
      module: {
        POST: createRefreshPOST('meet', {
          verificationBaseUrl: 'https://tuturuuu.com',
        }),
      },
    },
    // Not on the admission list: the auth writer layer must still refuse.
    {
      pattern: '/api/custom/verify',
      module: {
        POST: createPOST('meet', {
          verificationBaseUrl: 'https://tuturuuu.com',
        }),
      },
    },
    { pattern: '/api/me', module: { GET: ownApi } },
  ],
  assets: () => undefined,
  centralApiOrigin: () => 'https://central.example',
});

function signedCookies() {
  const pair = createAppSessionTokenPair({
    userId: 'user-1',
    targetApp: 'meet',
  });
  return `tuturuuu_app_session=${pair.access.token}; tuturuuu_app_session_refresh=${pair.refresh.token}`;
}
function send(url: string, init: RequestInit = {}) {
  return handle(new Request(url, init), {}, ctx);
}
function post(url: string, body: unknown, headers: HeadersInit = {}) {
  return send(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}
const appSessionCookies = (response: Response) =>
  response.headers.getSetCookie().filter((c) => APP_SESSION_COOKIE.test(c));
const supabaseHeaders = (extra = '') => ({
  cookie: [`${SUPABASE_COOKIE}=base64-session`, extra]
    .filter(Boolean)
    .join('; '),
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'synthetic-mount-secret');
  vi.stubGlobal('fetch', verifier);
  verifier.mockClear();
  ownApi.mockClear();
  start.mockClear();
  mocks.enforceRequiredMfa.mockReset().mockResolvedValue(null);
  mocks.createClient.mockReset().mockResolvedValue({
    auth: { mfa: { listFactors: async () => ({ data: { totp: [] } }) } },
  });
  mocks.updateSession.mockReset().mockImplementation(async () => {
    const res = NextResponse.next();
    res.cookies.set(SUPABASE_COOKIE, 'base64-rotated', { path: '/' });
    return {
      res,
      claims: { sub: 'user-1', aal: 'aal1', email: 'a@x.test' },
    };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('mounted session-minting endpoints', () => {
  it('refuses verify with 409 before consuming the token', async () => {
    const response = await post(`${MOUNTED}/api/auth/verify-app-token`, {
      token: 'one-time',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'APP_SESSION_MOUNTED',
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(verifier).not.toHaveBeenCalled();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('refuses refresh with 409 without rotating', async () => {
    const response = await post(
      `${MOUNTED}/api/auth/refresh-app-session/`,
      { refreshToken: 'ttr_app_refresh' },
      { cookie: signedCookies() }
    );
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(verifier).not.toHaveBeenCalled();
  });

  it('refuses at the auth layer when a route misses admission', async () => {
    const response = await post(`${MOUNTED}/api/custom/verify`, {
      token: 'one-time',
    });
    expect(response.status).toBe(409);
    expect(appSessionCookies(response)).toEqual([]);
    expect(verifier).not.toHaveBeenCalled();
  });
});

describe('mounted ordinary requests use the root session', () => {
  it('serves a page with no app-session write or clear', async () => {
    const response = await send(`${MOUNTED}/rooms`, {
      headers: supabaseHeaders(signedCookies()),
    });
    expect(await response.text()).toBe('page');
    expect(appSessionCookies(response)).toEqual([]);
    // The root Supabase session still refreshes.
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringContaining(`${SUPABASE_COOKIE}=base64-rotated`),
    ]);
    expect(verifier).not.toHaveBeenCalled();
  });

  it('authenticates an API request with an in-memory bearer only', async () => {
    const response = await send(`${MOUNTED}/api/me`, {
      headers: supabaseHeaders(),
    });
    expect(await response.text()).toBe('bearer');
    expect(appSessionCookies(response)).toEqual([]);
  });

  it('keeps the MFA redirect free of app-session clears', async () => {
    mocks.enforceRequiredMfa.mockResolvedValue({ status: 403 });
    const response = await send(`${MOUNTED}/rooms`, {
      headers: supabaseHeaders(),
    });
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(appSessionCookies(response)).toEqual([]);
  });

  it('never refreshes a cookie-borne app session without a root session', async () => {
    const response = await send(`${MOUNTED}/api/me`, {
      headers: { cookie: signedCookies() },
    });
    expect(response.status).toBe(401);
    expect(appSessionCookies(response)).toEqual([]);
    expect(verifier).not.toHaveBeenCalled();
    expect(ownApi).not.toHaveBeenCalled();
  });
});

describe('root mode is unchanged', () => {
  it('verifies and sets the app-session pair', async () => {
    const response = await post(`${ROOT}/api/auth/verify-app-token`, {
      token: 'one-time',
    });
    expect(response.status).toBe(200);
    expect(verifier).toHaveBeenCalledOnce();
    expect(appSessionCookies(response).map((c) => c.split('=')[0])).toEqual([
      'tuturuuu_app_session',
      'tuturuuu_app_session_refresh',
    ]);
  });

  it('rotates through the refresh endpoint', async () => {
    const response = await post(`${ROOT}/api/auth/refresh-app-session`, {
      refreshToken: 'ttr_app_refresh',
    });
    expect(verifier).toHaveBeenCalledOnce();
    expect(response.status).not.toBe(409);
  });

  it('clears local app-session cookies on a Supabase-backed page', async () => {
    const response = await send(`${ROOT}/rooms`, {
      headers: supabaseHeaders(),
    });
    expect(await response.text()).toBe('page');
    expect(appSessionCookies(response).map((c) => c.split('=')[0])).toEqual(
      expect.arrayContaining([
        'tuturuuu_app_session',
        'tuturuuu_web_app_session',
      ])
    );
  });
});

describe('a client cannot choose the mode', () => {
  it('a spoofed mount header does not mount a root request', async () => {
    const response = await post(
      `${ROOT}/api/auth/verify-app-token`,
      { token: 'one-time' },
      { 'x-tuturuuu-app-base': '/meet' }
    );
    expect(response.status).toBe(200);
    expect(appSessionCookies(response)).not.toEqual([]);
  });

  it('an empty mount header does not unmount a mounted request', async () => {
    const response = await post(
      `${MOUNTED}/api/custom/verify`,
      { token: 'one-time' },
      { 'x-tuturuuu-app-base': '' }
    );
    expect(response.status).toBe(409);
    expect(verifier).not.toHaveBeenCalled();
  });
});
