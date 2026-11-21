import { randomBytes } from 'node:crypto';
import {
  createAppSessionRefreshToken,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session-core';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { MastermindEnvironment } from './auth';
import { mastermindRequest } from './request';
import { createAppRedeemProof } from '@tuturuuu/auth/app-redeem-proof';
import { exchangeHandoff, refreshSession, safeNextPath } from './session';

const now = Date.now();
const email = 'owner@example.invalid';
const secret = randomBytes(48).toString('hex');
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let env: MastermindEnvironment;
let team = 0;
const web = vi.fn<typeof fetch>();
beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true });
});
beforeEach(() => {
  env = {
    CF_ACCESS_TEAM_DOMAIN: `session-${++team}.cloudflareaccess.com`,
    CF_ACCESS_AUD: 'fixture',
    MASTERMIND_OWNER_EMAIL: email,
    OWNER_IDS: 'owner',
    TUTURUUU_APP_COORDINATION_SECRET: secret,
  };
  web.mockReset();
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/cdn-cgi/access/certs'))
        return Response.json({
          keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'k' }],
        });
      if (url === 'https://tuturuuu.com/api/v1/mastermind/access')
        return Response.json({ enabled: true });
      return web(input, init);
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

const access = () =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setIssuer(`https://${env.CF_ACCESS_TEAM_DOMAIN}`)
    .setAudience('fixture')
    .setIssuedAt(Math.floor(now / 1000) - 1)
    .setExpirationTime(Math.floor(now / 1000) + 120)
    .sign(keys.privateKey);
const issued = (userId = 'owner', target = 'mastermind', mail = email) => {
  const pair = createAppSessionTokenPair(
    { targetApp: target, userId, email: mail },
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
    '/en/..//evil.example',
    '/%2e%2e//evil.example',
    '/login',
    '/verify-token?token=x',
  ])
    expect(safeNextPath(raw)).toBe('/en');
});

test('handoff accepts only a 300 s owner session for target mastermind with the Access email', async () => {
  web.mockResolvedValueOnce(Response.json(issued()));
  expect(await exchangeHandoff('t', env, email, now)).toMatchObject({
    userId: 'owner',
  });
  const request = web.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-token/verify'
  );
  expect(await request.json()).toEqual({ targetApp: 'mastermind', token: 't' });
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
    expect(await exchangeHandoff('t', env, email, now)).toBeNull();
  }
  web.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.invalid' },
    })
  );
  expect(await exchangeHandoff('t', env, email, now)).toBeNull();
});

test('refresh needs a local owner refresh credential before calling Web', async () => {
  const cookie = (token: string) =>
    new Request('https://mastermind.tuturuuu.com/en', {
      headers: { cookie: `tuturuuu_app_session_refresh=${token}` },
    });
  expect(
    await refreshSession(
      new Request('https://mastermind.tuturuuu.com/en'),
      env,
      email,
      now
    )
  ).toBeNull();
  expect(
    await refreshSession(
      cookie(issued('intruder').appSessionRefreshToken),
      env,
      email,
      now
    )
  ).toBeNull();
  expect(
    await refreshSession(cookie(issued().appSessionToken), env, email, now)
  ).toBeNull();
  expect(web).not.toHaveBeenCalled();
  web.mockResolvedValueOnce(Response.json(issued()));
  expect(
    await refreshSession(
      cookie(issued().appSessionRefreshToken),
      env,
      email,
      now
    )
  ).toMatchObject({ userId: 'owner' });
  const request = web.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-session/refresh'
  );
});

test('verify-token sets host-only HttpOnly cookies and returns to the page', async () => {
  web.mockResolvedValueOnce(Response.json(issued()));
  const response = await mastermindRequest(
    new Request(
      'https://mastermind.tuturuuu.com/verify-token?token=t&nextUrl=%2Fvi',
      {
        headers: { 'Cf-Access-Jwt-Assertion': await access() },
      }
    ),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('/vi');
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) {
    expect(cookie).toMatch(
      /; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax$/
    );
    expect(cookie).not.toMatch(/Domain=/i);
  }
});

test('handoff, login and refresh are refused off the host or without Access, with zero Web calls', async () => {
  const jwt = await access();
  for (const [url, headers] of [
    [
      'https://preview.mastermind.tuturuuu.com/verify-token?token=t',
      { 'Cf-Access-Jwt-Assertion': jwt },
    ],
    [
      'https://tuturuuu.com/mastermind/verify-token?token=t',
      { 'Cf-Access-Jwt-Assertion': jwt },
    ],
    ['https://mastermind.tuturuuu.com/verify-token?token=t', {}],
    ['https://mastermind.tuturuuu.com/login', {}],
  ] as const) {
    const response = await mastermindRequest(
      new Request(url, { headers }),
      env,
      () => new Response('x'),
      now
    );
    expect(response.status).toBe(403);
  }
  expect(web).not.toHaveBeenCalled();
});

test('an expired access session rotates inline; without a session a navigation goes to login', async () => {
  const jwt = await access();
  const expired = createAppSessionToken(
    { targetApp: 'mastermind', userId: 'owner', email, expiresInSeconds: 300 },
    { secret, now: new Date(now - 600_000) }
  ).token;
  const refresh = issued().appSessionRefreshToken;
  web.mockResolvedValueOnce(Response.json(issued()));
  let rendered = 0;
  const response = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/en', {
      headers: {
        'Cf-Access-Jwt-Assertion': jwt,
        cookie: `tuturuuu_app_session=${expired}; tuturuuu_app_session_refresh=${refresh}`,
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
      headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Sec-Fetch-Mode': 'navigate' },
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
  expect(location.searchParams.get('returnUrl')).toBe(
    'https://mastermind.tuturuuu.com/verify-token?nextUrl=%2Fvi'
  );
});

test('a forced intruder handoff and a sessionless fetch are refused without cookies', async () => {
  const jwt = await access();
  web.mockResolvedValueOnce(Response.json(issued('intruder')));
  const csrf = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/verify-token?token=t', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    }),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(csrf.status).toBe(403);
  expect(csrf.headers.getSetCookie()).toEqual([]);
  const fetchOnly = await mastermindRequest(
    new Request('https://mastermind.tuturuuu.com/_serverFn/x', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Sec-Fetch-Mode': 'cors' },
    }),
    env,
    () => new Response('unreachable'),
    now
  );
  expect(fetchOnly.status).toBe(403);
});
