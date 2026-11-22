import { randomBytes } from 'node:crypto';
import {
  createAppSessionRefreshToken,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session-core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MastermindEnvironment } from './auth';
import { mastermindRequest } from './request';
import { createAppRedeemProof } from '@tuturuuu/auth/app-redeem-proof';
import {
  exchangeHandoff,
  loginRedirect,
  pkceChallenge,
  refreshSession,
  safeNextPath,
} from './session';

const now = Date.now();
const token = 'a'.repeat(64);
const state = 'loginstate0123456789abc'.slice(0, 22);
/** This browser's PKCE verifier, kept beside the nonce in the state cookie. */
const VERIFIER = 'v'.repeat(43);
/** A callback carrying this browser's login state. */
const callback = (next: string, handoff = token) =>
  new Request(
    `https://mastermind.tuturuuu.com/verify-token?token=${handoff}&nextUrl=${encodeURIComponent(`${next}${next.includes('?') ? '&' : '?'}mm_state=${state}`)}`,
    {
      headers: { cookie: `__Host-mastermind_login_state=${state}.${VERIFIER}` },
    }
  );
const email = 'owner@example.invalid';
const secret = randomBytes(48).toString('hex');
let env: MastermindEnvironment;
const web = vi.fn<typeof fetch>();
beforeEach(() => {
  env = {
    MASTERMIND_OWNER_EMAIL: email,
    OWNER_IDS: 'owner',
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
  web.mockReset();
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === 'https://tuturuuu.com/api/v1/mastermind/access')
        return Response.json({ enabled: true });
      return web(input, init);
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

/** An MFA (aal2) proof as Web carries it into the app session. */
const mfa = {
  sessionId: 'web-session',
  verifiedAt: Math.floor(now / 1000) - 60,
};
const issued = (userId = 'owner', target = 'mastermind', mail = email) => {
  const pair = createAppSessionTokenPair(
    { targetApp: target, userId, email: mail, mfa },
    { secret, now: new Date(now - 1000) }
  );
  return {
    valid: true,
    userId,
    appSessionToken: pair.access.token,
    appSessionExpiresAt: pair.access.expiresAt,
    appSessionRefreshToken: pair.refresh.token,
    appSessionRefreshExpiresAt: pair.refresh.expiresAt,
  };
};

test('return paths stay on the host and never loop through the handoff', () => {
  expect(safeNextPath('/vi?x=1')).toBe('/vi?x=1');
  for (const raw of [
    null,
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil',
    '/.//evil.example',
    '/..//evil.example',
    '/%2e%2e//evil.example',
    '/login',
    '/verify-token?token=x',
  ])
    expect(safeNextPath(raw)).toBe('/');
});

test('handoff accepts only a 300 s owner session for target mastermind with the owner email', async () => {
  web.mockResolvedValueOnce(Response.json(issued()));
  const issuerProof = 'i'.repeat(43);
  expect(
    await exchangeHandoff('t', VERIFIER, env, now, fetch, issuerProof)
  ).toMatchObject({
    userId: 'owner',
  });
  const request = web.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-token/verify'
  );
  // The verifier binds the redemption to the browser that started sign-in.
  expect(await request.json()).toEqual({
    targetApp: 'mastermind',
    token: 't',
    codeVerifier: VERIFIER,
    issuerProof,
  });
  expect(request.headers.get('x-tuturuuu-app-redeem-proof')).toBe(
    createAppRedeemProof('mastermind', 't', secret)
  );
  const long = createAppSessionToken(
    { targetApp: 'mastermind', userId: 'owner', email, expiresInSeconds: 3600 },
    { secret, now: new Date(now - 1000) }
  ).token;
  const longRefresh = createAppSessionRefreshToken(
    {
      targetApp: 'mastermind',
      userId: 'owner',
      email,
      expiresInSeconds: 172_800,
    },
    { secret, now: new Date(now - 1000) }
  ).token;
  for (const body of [
    issued('intruder'),
    { ...issued(), appSessionRefreshToken: longRefresh },
    issued('owner', 'calendar'),
    issued('owner', 'mastermind', 'other@example.invalid'),
    { ...issued(), appSessionToken: long },
    { ...issued(), valid: false },
  ]) {
    web.mockResolvedValueOnce(Response.json(body));
    expect(await exchangeHandoff('t', VERIFIER, env, now)).toBeNull();
  }
  web.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.invalid' },
    })
  );
  expect(await exchangeHandoff('t', VERIFIER, env, now)).toBeNull();
});

test('refresh needs a local owner refresh credential before calling Web', async () => {
  const cookie = (token: string) =>
    new Request('https://mastermind.tuturuuu.com/', {
      headers: { cookie: `__Host-mastermind_refresh=${token}` },
    });
  expect(
    await refreshSession(
      new Request('https://mastermind.tuturuuu.com/'),
      env,
      now
    )
  ).toBeNull();
  expect(
    await refreshSession(cookie(issued().appSessionToken), env, now)
  ).toBeNull();
  expect(web).not.toHaveBeenCalled();
  // A non-owner subject is renewed only into a session with a live grant;
  // the grant check needs the new bearer, so Web is asked first.
  web.mockResolvedValueOnce(Response.json(issued('intruder')));
  expect(
    await refreshSession(
      cookie(issued('intruder').appSessionRefreshToken),
      env,
      now
    )
  ).toBeNull();
  // A refresh renews only its own subject.
  web.mockResolvedValueOnce(Response.json(issued('intruder')));
  expect(
    await refreshSession(cookie(issued().appSessionRefreshToken), env, now)
  ).toBeNull();
  web.mockClear();
  web.mockResolvedValueOnce(Response.json(issued()));
  expect(
    await refreshSession(cookie(issued().appSessionRefreshToken), env, now)
  ).toMatchObject({ userId: 'owner' });
  const request = web.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-session/refresh'
  );
});

test('verify-token sets host-only HttpOnly cookies and returns to the page', async () => {
  web.mockResolvedValueOnce(Response.json(issued()));
  const response = await mastermindRequest(
    callback('/vi?tab=1'),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('/vi?tab=1');
  const [clear, ...cookies] = response.headers.getSetCookie();
  expect(clear).toMatch(/^__Host-mastermind_login_state=; Path=\/; Max-Age=0;/);
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) {
    expect(cookie).toMatch(
      /; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax$/
    );
    expect(cookie).not.toMatch(/Domain=/i);
  }
});

test('handoff and login are refused off the host with zero Web calls; login needs no session', async () => {
  for (const url of [
    'https://preview.mastermind.tuturuuu.com/verify-token?token=t',
    'https://tuturuuu.com/mastermind/verify-token?token=t',
    'https://preview.mastermind.tuturuuu.com/login',
    'http://mastermind.tuturuuu.com/login',
  ]) {
    const response = await mastermindRequest(
      new Request(url),
      env,
      () => new Response('x'),
      now
    );
    expect(response.status).toBe(403);
  }
  expect(web).not.toHaveBeenCalled();
  const login = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/login?nextUrl=%2Fvi'),
    env,
    () => new Response('x'),
    now
  );
  expect(login.status).toBe(303);
  expect(new URL(login.headers.get('Location') ?? '').origin).toBe(
    'https://tuturuuu.com'
  );
  expect(web).not.toHaveBeenCalled();
});

test('an expired access session rotates inline; without a session a navigation goes to login', async () => {
  const expired = createAppSessionToken(
    {
      targetApp: 'mastermind',
      userId: 'owner',
      email,
      expiresInSeconds: 300,
      mfa,
    },
    { secret, now: new Date(now - 600_000) }
  ).token;
  const refresh = issued().appSessionRefreshToken;
  web.mockResolvedValueOnce(Response.json(issued()));
  let rendered = 0;
  const response = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/', {
      headers: {
        cookie: `__Host-mastermind_session=${expired}; __Host-mastermind_refresh=${refresh}`,
      },
    }),
    env,
    () => {
      rendered++;
      return new Response('page');
    },
    now
  );
  expect(response.status).toBe(200);
  expect(rendered).toBe(1);
  expect(response.headers.getSetCookie()).toHaveLength(2);
  const login = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/vi', {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    }),
    env,
    () => new Response('x'),
    now
  );
  expect(login.status).toBe(303);
  const location = new URL(login.headers.get('Location') ?? '');
  expect(location.origin + location.pathname).toBe(
    'https://tuturuuu.com/login'
  );
  const returnUrl = new URL(location.searchParams.get('returnUrl') ?? '');
  expect(returnUrl.origin + returnUrl.pathname).toBe(
    'https://mastermind.tuturuuu.com/verify-token'
  );
  const next = new URL(
    returnUrl.searchParams.get('nextUrl') ?? '',
    'https://mastermind.tuturuuu.com'
  );
  expect(next.pathname).toBe('/vi');
  const nonce = next.searchParams.get('mm_state') ?? '';
  expect(nonce).toMatch(/^[\w-]{22}$/);
  const [cookie] = login.headers.getSetCookie();
  const verifier =
    new RegExp(
      `^__Host-mastermind_login_state=${nonce}\\.([\\w-]{43}); Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$`
    ).exec(cookie ?? '')?.[1] ?? '';
  expect(verifier).toHaveLength(43);
  // Web binds the handoff to this browser: the challenge is the verifier's.
  expect(location.searchParams.get('code_challenge')).toBe(
    await pkceChallenge(verifier)
  );
  expect(location.searchParams.get('code_challenge_method')).toBe('S256');
});

test('shared-name session cookies a sibling host could plant are ignored', async () => {
  const planted = issued().appSessionToken;
  let rendered = 0;
  for (const name of [
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
  ]) {
    const response = await mastermindRequest(
      new Request('https://mastermind.tuturuuu.com/ship', {
        headers: { cookie: `${name}=${planted}` },
      }),
      env,
      () => {
        rendered++;
        return new Response('page');
      },
      now
    );
    expect(response.status).toBe(403);
  }
  expect(rendered).toBe(0);
  expect(web).not.toHaveBeenCalled();
  const own = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/', {
      headers: { cookie: `__Host-mastermind_session=${planted}` },
    }),
    env,
    () => new Response('page'),
    now
  );
  expect(own.status).toBe(200);
});

test("a callback without this browser's login state or with a malformed token never reaches Web", async () => {
  const handoff = `token=${token}&nextUrl=${encodeURIComponent(`/vi?mm_state=${state}`)}`;
  for (const request of [
    // Login CSRF: a handoff URL started in another browser has no state cookie.
    new Request(`https://mastermind.tuturuuu.com/verify-token?${handoff}`),
    new Request(`https://mastermind.tuturuuu.com/verify-token?${handoff}`, {
      headers: { cookie: '__Host-mastermind_login_state=other-state' },
    }),
    // The nonce alone is not enough: Web redeems only with the verifier.
    new Request(`https://mastermind.tuturuuu.com/verify-token?${handoff}`, {
      headers: { cookie: `__Host-mastermind_login_state=${state}` },
    }),
    new Request(
      `https://mastermind.tuturuuu.com/verify-token?token=${token}&nextUrl=%2Fvi`,
      {
        headers: {
          cookie: `__Host-mastermind_login_state=${state}.${VERIFIER}`,
        },
      }
    ),
    callback('/vi', 't'),
    callback('/vi', 'A'.repeat(64)),
    callback('/vi', `${token}0`),
  ]) {
    const response = await mastermindRequest(
      request,
      env,
      () => new Response('unreachable'),
      now
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([
      '__Host-mastermind_login_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ]);
  }
  expect(web).not.toHaveBeenCalled();
});

test('a forced intruder handoff and a sessionless fetch are refused without cookies', async () => {
  web.mockResolvedValueOnce(Response.json(issued('intruder')));
  const csrf = await mastermindRequest(
    callback('/'),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(csrf.status).toBe(403);
  expect(csrf.headers.getSetCookie()).toHaveLength(1);
  expect(csrf.headers.getSetCookie()[0]).toMatch(
    /^__Host-mastermind_login_state=;/
  );
  const fetchOnly = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/_serverFn/x', {
      headers: { 'Sec-Fetch-Mode': 'cors' },
    }),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(fetchOnly.status).toBe(403);
});

test('a step-up sign-in asks Web for a second factor verified in the last 30 seconds, and changes nothing else', async () => {
  const location = (response: Response) =>
    new URL(response.headers.get('Location') ?? '');
  const login = (query: string) =>
    mastermindRequest(
      new Request(`https://mastermind.tuturuuu.com/login${query}`),
      env,
      () => new Response('x'),
      now
    );
  const plain = location(await login('?nextUrl=%2Fvi%2Fprojects'));
  const fresh = location(await login('?nextUrl=%2Fvi%2Fprojects&mfa=fresh'));
  expect(plain.searchParams.has('mfaMaxAge')).toBe(false);
  expect(fresh.searchParams.get('mfaMaxAge')).toBe('30');
  // Only the literal value asks for it, and it never carries a number in.
  for (const query of ['?mfa=1', '?mfa=FRESH', '?mfa=', '?mfaMaxAge=5'])
    expect(location(await login(query)).searchParams.has('mfaMaxAge')).toBe(
      false
    );

  // Same host, same path, same callback: the return URL is built as ever.
  const returnTo = (url: URL) => {
    const verify = new URL(url.searchParams.get('returnUrl') ?? '');
    const next = new URL(
      verify.searchParams.get('nextUrl') ?? '',
      'https://mastermind.tuturuuu.com'
    );
    next.searchParams.delete('mm_state');
    return [verify.origin + verify.pathname, next.pathname + next.search];
  };
  expect(fresh.origin + fresh.pathname).toBe('https://tuturuuu.com/login');
  expect(returnTo(fresh)).toEqual(returnTo(plain));
  expect(returnTo(fresh)).toEqual([
    'https://mastermind.tuturuuu.com/verify-token',
    '/vi/projects',
  ]);
  // A next path that tries to leave the host is dropped with or without it.
  const away = location(
    await login('?nextUrl=https%3A%2F%2Fevil.example%2Fx&mfa=fresh')
  );
  expect(returnTo(away)[0]).toBe(
    'https://mastermind.tuturuuu.com/verify-token'
  );
  expect(returnTo(away)[1]).toMatch(/^\//);
  expect(away.searchParams.get('returnUrl')).not.toContain('evil.example');
  expect(web).not.toHaveBeenCalled();

  expect(
    location(
      await loginRedirect('/', env, { freshMfa: true }, now)
    ).searchParams.get('mfaMaxAge')
  ).toBe('30');
});
