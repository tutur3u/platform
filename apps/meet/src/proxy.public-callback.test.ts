import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMeetPolicy } from '../../../scripts/ci/meet-native-policy.mjs';
import { proxy } from './proxy';
import { dispatchThroughMeetProxy } from './runtime/proxy-bridge';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://meet-ci.supabase.invalid');
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://meet-ci.supabase.invalid');
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'sb_publishable_meet_ci_placeholder'
  );
  vi.stubEnv('SUPABASE_SECRET_KEY', 'a'.repeat(72));
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'a'.repeat(72));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected public callback egress');
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

for (const method of ['GET', 'HEAD'])
  for (const path of ['/verify-token', '/vi/verify-token'])
    it(`real proxy passes tokenless ${method} ${path} to locale rendering without egress`, async () => {
      const response = await dispatchThroughMeetProxy({
        request: new Request(
          `https://meet.tuturuuu.com${path}?nextUrl=https://untrusted.invalid`,
          { method }
        ),
        proxy,
        waitUntil: () => {},
        dispatch: async (forwarded) =>
          Response.json({
            locale: forwarded.headers.get('x-next-intl-locale'),
            pathname: forwarded.nextUrl.pathname,
          }),
      });
      expect(response.headers.has('location')).toBe(false);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        locale: path.startsWith('/vi') ? 'vi' : 'en',
        pathname: path.startsWith('/vi')
          ? '/vi/verify-token'
          : '/en/verify-token',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

for (const path of [
  '/personal/meetings',
  '/vi/personal/meetings',
  '/personal/verify-token',
])
  it(`real proxy retains authentication for ${path}`, async () => {
    const response = await proxy(
      new NextRequest(`https://meet.tuturuuu.com${path}`)
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(
      '/login'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

for (const method of ['POST', 'PUT'])
  it(`tokenless ${method} keeps the shared verifier redirect contract`, async () => {
    const response = await proxy(
      new NextRequest(
        'https://meet.tuturuuu.com/verify-token?nextUrl=https://untrusted.invalid',
        { method }
      )
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://meet.tuturuuu.com/');
    expect(fetch).not.toHaveBeenCalled();
  });

it('an explicit empty token retains shared verifier handling', async () => {
  const response = await proxy(
    new NextRequest(
      'https://meet.tuturuuu.com/vi/verify-token?token=&nextUrl=https://untrusted.invalid'
    )
  );
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://meet.tuturuuu.com/');
  expect(fetch).not.toHaveBeenCalled();
});

it('token-present verifier still calls only its local verification endpoint and rejects invalid tokens', async () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ valid: false }, { status: 401 })
  );
  vi.stubGlobal('fetch', fetchMock);
  const response = await proxy(
    new NextRequest(
      'https://meet.tuturuuu.com/vi/verify-token?token=invalid&nextUrl=https://untrusted.invalid'
    )
  );
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://meet.tuturuuu.com/');
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
    '/api/auth/verify-app-token'
  );
});

for (const scenario of ['eligible', 'banned', 'required', 'unavailable'])
  for (const path of ['/api/auth/logout', '/api/v1/meet-ci-rewrite'])
    it(`real proxy/current account assurance ${scenario} for ${path}`, async () => {
      const policy = createMeetPolicy('app', { assuranceKey: 'a'.repeat(72) });
      vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await policy.handler(new Request(input, init));
          expect(response.status).toBe(200);
          if (scenario === 'unavailable')
            return Response.json({ error: 'unavailable' }, { status: 503 });
          const user = await response.json();
          if (scenario === 'banned')
            user.banned_until = '9999-01-01T00:00:00.000Z';
          if (scenario === 'required')
            user.app_metadata = {
              tuturuuu_required_mfa: { required: true, verifiedAfter: 1 },
            };
          return Response.json(user);
        }
      );
      const token = (targetApp: 'meet' | 'web') =>
        createAppSessionToken({
          userId: 'be0e8f2e-c239-4e40-a1f4-d6881938cae4',
          targetApp,
        }).token;
      const request = new NextRequest(`https://meet.tuturuuu.com${path}`, {
        method: 'POST',
        headers: {
          cookie: `tuturuuu_app_session=${token('meet')}; tuturuuu_web_app_session=${token('web')}`,
          origin: 'https://meet.tuturuuu.com',
        },
      });
      const response = await proxy(request);
      expect(response.status).toBe(
        scenario === 'eligible'
          ? 200
          : scenario === 'unavailable'
            ? 503
            : scenario === 'banned' && path === '/api/auth/logout'
              ? 401
              : 403
      );
      if (scenario === 'eligible') {
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(policy.assurance).toHaveLength(
          path === '/api/auth/logout' ? 2 : 3
        );
      } else {
        expect(response.headers.has('x-middleware-next')).toBe(false);
        expect(policy.assurance.length).toBeGreaterThan(0);
      }
      expect(policy.forwarded).toHaveLength(0);
      expect(policy.unexpected).toHaveLength(0);
    });

for (const method of ['GET', 'HEAD'])
  it(`explicit English ${method} callback keeps canonical locale redirect`, async () => {
    const response = await proxy(
      new NextRequest('https://meet.tuturuuu.com/en/verify-token', { method })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://meet.tuturuuu.com/verify-token'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

it('one graph account-assurance budget is exactly two plus three plus three real guard reads', async () => {
  const policy = createMeetPolicy('app', { assuranceKey: 'a'.repeat(72) });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    policy.handler(new Request(input, init))
  );
  let expected = 0;
  for (const path of [
    '/api/auth/logout',
    '/api/v1/meet-ci-rewrite',
    '/api/v1/meet-ci-denied',
  ]) {
    const token = (targetApp: 'meet' | 'web') =>
      createAppSessionToken({
        userId: 'be0e8f2e-c239-4e40-a1f4-d6881938cae4',
        targetApp,
      }).token;
    const response = await proxy(
      new NextRequest(`https://meet.tuturuuu.com${path}`, {
        method: 'POST',
        headers: {
          cookie: `tuturuuu_app_session=${token('meet')}; tuturuuu_web_app_session=${token('web')}`,
          origin: 'https://meet.tuturuuu.com',
        },
      })
    );
    expected += path === '/api/auth/logout' ? 2 : 3;
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(policy.assurance).toHaveLength(expected);
  }
  expect(policy.assurance).toHaveLength(8);
  expect(policy.unexpected).toHaveLength(0);
  expect(policy.forwarded).toHaveLength(0);
});
