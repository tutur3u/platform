import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
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

for (const adapter of ['direct NextRequest', 'Worker Request bridge'])
  it(`real ${adapter} login accepts wildcard transport language before Start`, async () => {
    const url =
      'https://meet.tuturuuu.com/login?next=https%3A%2F%2Funtrusted.invalid%2F';
    const dispatch = vi.fn(async (forwarded: NextRequest) => {
      expect(forwarded.nextUrl.pathname).toBe('/en/login');
      expect(forwarded.nextUrl.searchParams.get('next')).toBe(
        'https://untrusted.invalid/'
      );
      return new Response(null, { status: 204 });
    });
    const init = {
      method: 'GET',
      redirect: 'manual',
      headers: { 'accept-language': '*' },
    } as const;
    const response =
      adapter === 'direct NextRequest'
        ? await proxy(new NextRequest(url, init))
        : await dispatchThroughMeetProxy({
            request: new Request(url, init),
            proxy,
            waitUntil: () => {},
            dispatch,
          });
    expect(response.status).toBe(adapter === 'direct NextRequest' ? 200 : 204);
    if (adapter === 'direct NextRequest') {
      expect(
        new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname
      ).toBe('/en/login');
      expect(dispatch).not.toHaveBeenCalled();
    } else expect(dispatch).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    await response.text();
  });

for (const path of ['/login', '/vi/login'])
  it(`headerless real Worker bridge ${path} characterizes the proxy boundary before SSO page rendering`, async () => {
    const dispatch = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await dispatchThroughMeetProxy({
      request: new Request(
        `https://meet.tuturuuu.com${path}?next=https%3A%2F%2Funtrusted.invalid%2F`,
        { method: 'GET', redirect: 'manual' }
      ),
      proxy,
      waitUntil: () => {},
      dispatch,
    });
    if (path === '/login') {
      expect(response.status).toBe(204);
      expect(dispatch).toHaveBeenCalledOnce();
    } else {
      expect(response.status).toBe(204);
      expect(dispatch).toHaveBeenCalledOnce();
      expect(response.headers.has('location')).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
    await response.text();
  });

for (const [language, locale] of [
  ['*', 'en'],
  ['en_US', 'en'],
  ['en_US,vi-VN;q=0.8,en-US;q=0.7', 'vi'],
  ['*;q=1,vi-VN;q=0.9,en-US;q=0.8', 'vi'],
  ['vi-VN;q=0,en-US;q=0.8,*;q=0.7', 'en'],
  ['vi-VN;q=0.9,en-US;q=0.8', 'vi'],
  ['en-US;q=0.9,vi-VN;q=0.8', 'en'],
  ['en-US;q=0,vi-VN;q=0,*;q=0', 'en'],
  ['bad_tag;q=1,vi-VN;q=0,en-US;q=0.2', 'en'],
  ['fr-FR', 'en'],
])
  it(`real locale negotiation ${language} selects ${locale} without accepting zero-quality ranges`, async () => {
    const response = await dispatchThroughMeetProxy({
      request: new Request('https://meet.tuturuuu.com/login', {
        headers: { 'accept-language': language },
      }),
      proxy,
      waitUntil: () => {},
      dispatch: async (forwarded) =>
        Response.json({
          locale: forwarded.headers.get('x-next-intl-locale'),
          path: forwarded.nextUrl.pathname,
        }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locale, path: `/${locale}/login` });
    expect(fetch).not.toHaveBeenCalled();
  });

for (const [cookie, language, locale] of [
  ['vi', 'en-US', 'vi'],
  ['en', 'vi-VN', 'en'],
  ['vi', '*', 'vi'],
  ['en', 'en_US', 'en'],
])
  it(`existing ${cookie} locale cookie takes precedence over ${language}`, async () => {
    const response = await dispatchThroughMeetProxy({
      request: new Request('https://meet.tuturuuu.com/login', {
        headers: {
          cookie: `NEXT_LOCALE=${cookie}`,
          'accept-language': language,
        },
      }),
      proxy,
      waitUntil: () => {},
      dispatch: async (forwarded) =>
        Response.json({ locale: forwarded.headers.get('x-next-intl-locale') }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locale });
    expect(fetch).not.toHaveBeenCalled();
  });
for (const locale of ['en', 'vi'])
  it(`explicit ${locale} URL keeps precedence over the opposite locale cookie and invalid language`, async () => {
    const response = await proxy(
      new NextRequest(`https://meet.tuturuuu.com/${locale}/login`, {
        headers: {
          cookie: `NEXT_LOCALE=${locale === 'en' ? 'vi' : 'en'}`,
          'accept-language': '*',
        },
      })
    );
    if (locale === 'en') {
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe(
        '/login'
      );
    } else {
      expect(response.status).toBe(200);
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe('vi');
    }
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe(locale);
    expect(fetch).not.toHaveBeenCalled();
    await response.text();
  });
it('the unchanged shared SSO next-path guard rejects the external login destination', () => {
  expect(
    normalizeAuthRedirectPath(
      'https://untrusted.invalid/',
      'https://meet.tuturuuu.com',
      '/'
    )
  ).toBe('/');
});

const loginLocaleCases: {
  name: string;
  headers: Record<string, string>;
  locale: 'en' | 'vi';
}[] = [
  { name: 'headerless', headers: {}, locale: 'en' },
  {
    name: 'English header',
    headers: { 'accept-language': 'en-US,en;q=0.8' },
    locale: 'en',
  },
  {
    name: 'Vietnamese header',
    headers: { 'accept-language': 'vi-VN,vi;q=0.8' },
    locale: 'vi',
  },
  {
    name: 'Vietnamese cookie over English header',
    headers: { 'accept-language': 'en-US', cookie: 'NEXT_LOCALE=vi' },
    locale: 'vi',
  },
  {
    name: 'English cookie over Vietnamese header',
    headers: { 'accept-language': 'vi-VN', cookie: 'NEXT_LOCALE=en' },
    locale: 'en',
  },
];

for (const path of ['/login', '/vi/login'])
  for (const { name, headers, locale } of loginLocaleCases)
    it(`real proxy bridge ${path}, ${name} reaches a fixed Start SSO port in one hop`, async () => {
      const origin = 'https://meet.tuturuuu.com';
      const query = '?next=https%3A%2F%2Funtrusted.invalid%2F';
      const canonical =
        'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Fmeet.tuturuuu.com%2Fverify-token%3FnextUrl%3D%252F';
      const expectedLocale = path === '/vi/login' ? 'vi' : locale;
      // Fixed Start response bounds this to proxy/bridge continuation, not page rendering.
      const dispatch = vi.fn(async (forwarded: NextRequest) => {
        expect(forwarded.nextUrl.pathname).toBe(`/${expectedLocale}/login`);
        expect(forwarded.nextUrl.search).toBe(query);
        expect(forwarded.headers.get('x-next-intl-locale')).toBe(
          expectedLocale
        );
        expect(
          normalizeAuthRedirectPath(
            forwarded.nextUrl.searchParams.get('next'),
            origin,
            '/'
          )
        ).toBe('/');
        return new Response(null, {
          status: 307,
          headers: { location: canonical },
        });
      });
      const response = await dispatchThroughMeetProxy({
        request: new Request(`${origin}${path}${query}`, {
          headers,
          redirect: 'manual',
        }),
        proxy,
        waitUntil: () => {},
        dispatch,
      });
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.origin).toBe('https://tuturuuu.com');
      expect(location.pathname).toBe('/login');
      expect(location.href).toBe(canonical);
      const callback = new URL(location.searchParams.get('returnUrl') ?? '');
      expect(callback.origin).toBe(origin);
      expect(callback.pathname).toBe('/verify-token');
      expect(callback.search).toBe('?nextUrl=%2F');
      expect(callback.searchParams.get('nextUrl')).toBe('/');
      expect(dispatch).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      await response.text();
    });
