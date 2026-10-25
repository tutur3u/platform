// @vitest-environment node
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppSessionTokenPair,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordsAuthEdge } from './auth-edge';
import { LOGIN_COOKIE } from './auth-edge-protocol';

const origin = 'https://passwords.tuturuuu.com';
const central = 'https://tuturuuu.com';
const secret = 'fixture-only-passwords-coordination-secret';
const now = 1_800_000_000;
const proof = { sessionId: 'provider-session', verifiedAt: now - 20 };
const env = {
  PASSWORDS_ENABLED: 'true',
  NEXT_PUBLIC_APP_URL: origin,
  NEXT_PUBLIC_WEB_APP_URL: central,
  TUTURUUU_APP_COORDINATION_SECRET: secret,
};
const transport = vi.fn<typeof fetch>();

function tokens(
  userId = 'user-a',
  targetApp = 'passwords',
  mfa: typeof proof | undefined = proof,
  signingSecret = secret
) {
  const pair = createAppSessionTokenPair(
    { userId, targetApp, mfa },
    { secret: signingSecret, now: new Date(now * 1000) }
  );
  return {
    appSessionToken: pair.access.token,
    appSessionRefreshToken: pair.refresh.token,
  };
}
function request(path: string, init?: RequestInit) {
  return new Request(new URL(path, origin), init);
}
function sessionCookies(userId = 'user-a') {
  const pair = tokens(userId);
  return `${APP_SESSION_COOKIE_NAME}=${pair.appSessionToken}; ${APP_SESSION_REFRESH_COOKIE_NAME}=${pair.appSessionRefreshToken}`;
}
function edge(overrides = {}) {
  return createPasswordsAuthEdge(
    { ...env, ...overrides },
    { fetch: transport, now: () => now }
  );
}
function storedCookies(result: Response) {
  return result.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
async function begin(session = '', stepUp = false) {
  const result = await edge().handle(
    request(
      stepUp
        ? '/api/auth/step-up?next=%2Fvi%2Fworkspace%3Ftab%3Ditems'
        : '/vi/workspace?tab=items',
      { headers: { accept: 'text/html', cookie: session } }
    )
  );
  expect(result?.status).toBe(303);
  const login = new URL(result!.headers.get('location')!);
  const next = new URL(login.searchParams.get(stepUp ? 'next' : 'returnUrl')!);
  const callback = new URL('/verify-token', origin);
  callback.searchParams.set('token', 'single-use-code');
  callback.searchParams.set('nextUrl', `${next.pathname}${next.search}`);
  return {
    callback,
    next,
    login,
    cookies: [session, storedCookies(result!)].filter(Boolean).join('; '),
    result: result!,
  };
}

beforeEach(() => {
  transport.mockReset();
  transport.mockImplementation(async () => Response.json(tokens()));
});

describe('Passwords browser auth edge', () => {
  it.each([undefined, 'false', 'TRUE', '1'])(
    'stops before any auth work when enabled is %s',
    async (value) => {
      const result = await edge({ PASSWORDS_ENABLED: value }).handle(
        request('/verify-token?token=anything')
      );
      expect(result?.status).toBe(503);
      expect(await result?.json()).toEqual({ code: 'STOPPED' });
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it('creates a host-only secure state cookie and preserves locale and safe page path', async () => {
    const attempt = await begin();
    expect(attempt.login.origin).toBe(central);
    expect(attempt.login.pathname).toBe('/vi/login');
    expect(attempt.next.origin).toBe(origin);
    expect(attempt.next.pathname).toBe('/vi/workspace');
    const cookie = attempt.result.headers.get('set-cookie')!;
    expect(cookie).toContain(`${LOGIN_COOKIE}=`);
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
    expect(transport).not.toHaveBeenCalled();
  });
  it('correlates nested state, verifies signed tokens and redirects without auth artifacts', async () => {
    const attempt = await begin();
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.status).toBe(303);
    expect(result?.headers.get('location')).toBe(
      `${origin}/vi/workspace?tab=items`
    );
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe(`${central}/api/v1/auth/cross-app-token/verify`);
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      token: 'single-use-code',
      targetApp: 'passwords',
    });
    const cookies = result!.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(
      cookies.every(
        (value) =>
          value.includes('HttpOnly; Secure; SameSite=Lax') &&
          !value.includes('Domain=')
      )
    ).toBe(true);
    expect(cookies[2]).toContain('Max-Age=0');
    expect(result?.headers.get('cache-control')).toBe('no-store');
    expect(result?.headers.get('referrer-policy')).toBe('no-referrer');
    const access = cookies[0]!
      .split(';')[0]!
      .slice(APP_SESSION_COOKIE_NAME.length + 1);
    const verified = verifyAppSessionToken(access, {
      targetApp: 'passwords',
      secret,
      now: new Date(now * 1000),
    });
    expect(verified.ok && verified.claims.mfa).toEqual(proof);
  });
  it.each(['missing', 'mismatch', 'tampered', 'foreign-next', 'duplicate'])(
    'rejects %s state before consuming a code',
    async (kind) => {
      const attempt = await begin();
      let cookies = attempt.cookies;
      if (kind === 'missing') cookies = '';
      if (kind === 'mismatch')
        attempt.callback.searchParams.set('state', 'other');
      if (kind === 'tampered') cookies = cookies.replace(/.$/u, 'x');
      if (kind === 'foreign-next')
        attempt.callback.searchParams.set(
          'nextUrl',
          'https://evil.test/?state=any'
        );
      if (kind === 'duplicate') {
        attempt.callback.searchParams.append('state', 'duplicate');
        attempt.callback.searchParams.append('state', 'duplicate');
      }
      const result = await edge().handle(
        request(attempt.callback.toString(), { headers: { cookie: cookies } })
      );
      expect(result?.headers.get('location')).toBe(`${origin}/api/auth/error`);
      expect(result?.headers.has('set-cookie')).toBe(false);
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it('rejects an expired login attempt', async () => {
    const attempt = await begin();
    const expired = createPasswordsAuthEdge(env, {
      fetch: transport,
      now: () => now + 601,
    });
    await expired.handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    'bad-signature',
    'wrong-target',
    'mixed-subjects',
    'access-as-refresh',
  ])('rejects %s in a central response', async (kind) => {
    const attempt = await begin();
    const pair =
      kind === 'bad-signature'
        ? tokens('user-a', 'passwords', proof, 'other-key')
        : kind === 'wrong-target'
          ? tokens('user-a', 'meet')
          : tokens();
    if (kind === 'mixed-subjects')
      pair.appSessionRefreshToken = tokens('user-b').appSessionRefreshToken;
    if (kind === 'access-as-refresh')
      pair.appSessionRefreshToken = pair.appSessionToken;
    transport.mockResolvedValueOnce(Response.json(pair));
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.headers.has('set-cookie')).toBe(false);
    expect(result?.headers.get('location')).toBe(`${origin}/api/auth/error`);
  });
  it('does not silently swap an existing account, even with a correlated callback', async () => {
    const attempt = await begin(sessionCookies(), true);
    transport.mockResolvedValueOnce(Response.json(tokens('user-b')));
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.headers.has('set-cookie')).toBe(false);
    expect(result?.headers.get('location')).toBe(`${origin}/api/auth/error`);
  });
  it('rejects a callback if the browser account changed since step-up began', async () => {
    const attempt = await begin(sessionCookies(), true);
    const cookies = `${sessionCookies('user-b')}; ${storedCookies(attempt.result)}`;
    await edge().handle(
      request(attempt.callback.toString(), { headers: { cookie: cookies } })
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('starts a new central step-up and refuses a stale signed MFA timestamp', async () => {
    const attempt = await begin(sessionCookies(), true);
    expect(attempt.login.pathname).toBe('/vi/step-up');
    expect(attempt.login.searchParams.get('app')).toBe('passwords');
    transport.mockResolvedValueOnce(
      Response.json({
        ...tokens('user-a', 'passwords', { ...proof, verifiedAt: now - 301 }),
        mfa: proof,
      })
    );
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.headers.has('set-cookie')).toBe(false);
  });
  it('accepts a locale-prefixed correlated callback with a fresh signed proof', async () => {
    const attempt = await begin(sessionCookies(), true);
    attempt.callback.pathname = '/vi/verify-token';
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.headers.get('location')).toBe(
      `${origin}/vi/workspace?tab=items`
    );
  });
  it.each(['verify-app-token', 'refresh-app-session', 'logout'])(
    'requires same-origin POST for %s',
    async (endpoint) => {
      expect(
        (
          await edge().handle(
            request(`/api/auth/${endpoint}`, { method: 'POST' })
          )
        )?.status
      ).toBe(403);
      expect(
        (
          await edge().handle(
            request(`/api/auth/${endpoint}`, {
              method: 'POST',
              headers: { origin: 'https://evil.test' },
            })
          )
        )?.status
      ).toBe(403);
      expect(
        (await edge().handle(request(`/api/auth/${endpoint}`)))?.status
      ).toBe(405);
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it('verifies a same-origin POST only when its state matches the login cookie', async () => {
    const attempt = await begin();
    const result = await edge().handle(
      request('/api/auth/verify-app-token', {
        method: 'POST',
        headers: {
          origin,
          cookie: attempt.cookies,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token: 'single-use-code',
          state: attempt.next.searchParams.get('state'),
        }),
      })
    );
    expect(await result?.json()).toEqual({
      valid: true,
      nextUrl: '/vi/workspace?tab=items',
    });
  });
  it('refreshes once using the local signed refresh token and keeps old MFA', async () => {
    const cookies = sessionCookies();
    const result = await edge().handle(
      request('/api/auth/refresh-app-session', {
        method: 'POST',
        headers: { origin, cookie: cookies },
        body: JSON.stringify({
          refreshToken: 'attacker-input',
          mfa: { verifiedAt: now },
        }),
      })
    );
    expect(result?.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(transport.mock.calls[0]![1]?.body));
    expect(payload.refreshToken).toBe(
      cookies.split(`${APP_SESSION_REFRESH_COOKIE_NAME}=`)[1]
    );
    expect(payload.refreshToken).not.toBe('attacker-input');
    expect(payload.targetApp).toBe('passwords');
  });
  it('rejects freshened MFA in a refresh response', async () => {
    transport.mockResolvedValueOnce(
      Response.json(
        tokens('user-a', 'passwords', { ...proof, verifiedAt: now })
      )
    );
    const result = await edge().handle(
      request('/api/auth/refresh-app-session', {
        method: 'POST',
        headers: { origin, cookie: sessionCookies() },
      })
    );
    expect(result?.status).toBe(503);
    expect(result?.headers.has('set-cookie')).toBe(false);
  });
  it('clears only local auth cookies on logout', async () => {
    const result = await edge().handle(
      request('/api/auth/logout', {
        method: 'POST',
        headers: { origin, cookie: sessionCookies() },
      })
    );
    expect(result?.status).toBe(200);
    expect(result!.headers.getSetCookie()).toHaveLength(3);
    expect(
      result!.headers
        .getSetCookie()
        .every((value) => value.includes('Max-Age=0'))
    ).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not trust request origins or insecure central configuration', async () => {
    expect(
      (await edge().handle(new Request('https://evil.test/')))!.status
    ).toBe(403);
    expect(
      (await edge({ NEXT_PUBLIC_WEB_APP_URL: 'http://tuturuuu.com' }).handle(
        request('/')
      ))!.status
    ).toBe(503);
    expect(
      (await edge({ TUTURUUU_APP_COORDINATION_SECRET: '' }).handle(
        request('/')
      ))!.status
    ).toBe(503);
    expect(transport).not.toHaveBeenCalled();
  });
  it('keeps central failures generic with no retry', async () => {
    const attempt = await begin();
    transport.mockRejectedValueOnce(new Error('sensitive upstream body'));
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.status).toBe(303);
    expect(await result?.text()).not.toContain('sensitive');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('passes a valid browser session to the adapter and rejects unauthenticated API requests', async () => {
    expect(
      await edge().handle(
        request('/vi/workspace', { headers: { cookie: sessionCookies() } })
      )
    ).toBeNull();
    expect(
      (
        await edge().handle(
          request('/_passwords/functions/test', { method: 'POST' })
        )
      )?.status
    ).toBe(401);
  });
  it('preserves target-bound bearer requests without allowing bearer identity to bypass callback state', async () => {
    const headers = { authorization: `Bearer ${tokens().appSessionToken}` };
    expect(
      await edge().handle(
        request('/_passwords/functions/test', { method: 'POST', headers })
      )
    ).toBeNull();
    const callback = await edge().handle(
      request('/verify-token?token=unsolicited', { headers })
    );
    expect(callback?.headers.get('location')).toBe(`${origin}/api/auth/error`);
    expect(transport).not.toHaveBeenCalled();
  });
  it('bounds the upstream payload and rejects it without echoing contents', async () => {
    const attempt = await begin();
    transport.mockResolvedValueOnce(
      Response.json({ private: 'x'.repeat(32769) })
    );
    const result = await edge().handle(
      request(attempt.callback.toString(), {
        headers: { cookie: attempt.cookies },
      })
    );
    expect(result?.headers.has('set-cookie')).toBe(false);
    expect(await result?.text()).toBe('');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
