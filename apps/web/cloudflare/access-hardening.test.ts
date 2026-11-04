import { verifyOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { describe, expect, it, vi } from 'vitest';
import { type Fetcher, proxyNext } from './fallback';
import { type AccessVerifier, createWebCandidateHandler } from './handler';
import { stagingProfile, type WebCandidateEnv } from './profile';

const secret = 'disposable-test-origin-proof-key-123456';
const bypass = 'test-bypass-secret-00000000000000000000';
const origin = 'https://tuturuuu-next-fixture.vercel.app';
const env: WebCandidateEnv = {
  WEB_START_CANDIDATE: 'staging',
  NEXT_FALLBACK_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_PREFIX: stagingProfile.cookiePrefix,
  VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
  CF_ACCESS_TEAM_DOMAIN: 'fixture-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'fixture-aud',
};
const base = `https://${stagingProfile.host}`;
const request = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', '203.0.113.10');
  return new Request(`${base}${path}`, { ...init, headers });
};
function setup(
  verifyAccess: AccessVerifier = async () => true,
  upstream: () => Response = () =>
    new Response('Next', {
      headers: {
        [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
      },
    })
) {
  const fetcher = vi.fn<Fetcher>(async () => upstream());
  const start = vi.fn(async () => new Response('start'));
  const verify = vi.fn(verifyAccess);
  return {
    handler: createWebCandidateHandler({
      fetcher,
      start,
      verifyAccess: verify,
    }),
    fetcher,
    start,
    verify,
  };
}
function sent(fetcher: ReturnType<typeof setup>['fetcher']) {
  const input = fetcher.mock.calls.at(-1)?.[0];
  if (!(input instanceof Request)) throw new Error('Expected a forward');
  return input;
}

describe('Access JWT verification in the issuer Worker (N19, V2b)', () => {
  it('passes the configured team and AUD to the verifier', async () => {
    const { handler, verify, fetcher } = setup();
    expect((await handler(request('/login'), env)).status).toBe(404);
    expect(verify).toHaveBeenCalledWith(expect.any(Request), {
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ['rejects', async () => false],
    ['throws', async () => Promise.reject(new Error('jwks down'))],
  ])(
    'returns 403 with no Next or Start work when verification %s',
    async (_l, verifier) => {
      const { handler, fetcher, start } = setup(verifier);
      for (const path of ['/', '/login', '/api/v1/me', '/__web1', '/privacy']) {
        const response = await handler(request(path), {
          ...env,
          WEB_START_NATIVE_LEGAL: 'on',
        });
        expect(response.status).toBe(403);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect(fetcher).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  );
  it.each([
    { CF_ACCESS_TEAM_DOMAIN: undefined },
    { CF_ACCESS_TEAM_DOMAIN: 'evil.example.com' },
    { CF_ACCESS_AUD: ' ' },
  ])('stays disabled without complete Access inputs: %j', async (gap) => {
    const { handler, fetcher, verify } = setup();
    expect((await handler(request('/login'), { ...env, ...gap })).status).toBe(
      503
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('OPTIONS is answered locally (N20, V5b)', () => {
  it('never calls Next, Start or the Access verifier, even when Access would deny', async () => {
    const { handler, fetcher, start, verify } = setup(async () => false);
    for (const [path, extra] of [
      ['/api/v1/workspaces', { origin: 'https://calendar.tutur3u.com' }],
      ['/login', {}],
    ] as const) {
      const response = await handler(
        request(path, {
          method: 'OPTIONS',
          headers: {
            ...extra,
            'access-control-request-headers':
              'content-type, x-tuturuuu-turnstile-token',
          },
        }),
        env
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it('grants CORS only to exact single-label staging origins', async () => {
    const { handler } = setup();
    const ask = (value: string) =>
      handler(
        request('/api/x', {
          method: 'OPTIONS',
          headers: {
            origin: value,
            'access-control-request-headers': 'content-type',
          },
        }),
        env
      );
    const allowed = await ask('https://calendar.tutur3u.com');
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://calendar.tutur3u.com'
    );
    expect(allowed.headers.get('access-control-allow-credentials')).toBe(
      'true'
    );
    expect(allowed.headers.get('access-control-allow-headers')).toBe(
      'content-type'
    );
    for (const denied of [
      'https://calendar.tuturuuu.com',
      'https://a.b.tutur3u.com',
      'http://calendar.tutur3u.com',
      'https://calendar.tutur3u.com:444',
      'https://calendar.tutur3u.com.evil.test',
      'null',
    ])
      expect(
        (await ask(denied)).headers.has('access-control-allow-origin')
      ).toBe(false);
  });
});

describe('forwarded request hygiene (N13, V2a, V1c)', () => {
  function setup(
    _verify?: AccessVerifier,
    upstream: () => Response = () =>
      new Response('Next', {
        headers: {
          [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
        },
      })
  ) {
    const fetcher = vi.fn<Fetcher>(async () => upstream());
    return {
      fetcher,
      handler: (request: Request, _env: WebCandidateEnv) =>
        proxyNext(request, origin, secret, bypass, fetcher),
    };
  }

  it('strips Access credentials, client forwarding claims and server-owned names', async () => {
    const { handler, fetcher } = setup();
    await handler(
      request('/login', {
        headers: {
          'cf-access-jwt-assertion': 'user-jwt',
          'cf-access-authenticated-user-email': 'staff@tuturuuu.com',
          'cf-access-client-id': 'id',
          'cf-access-client-secret': 'secret',
          cookie:
            'CF_Authorization=a; sb-auth=fixture; CF_AppSession=b; CF_Binding=c',
          forwarded: 'for=192.0.2.1',
          'x-forwarded-for': '192.0.2.1',
          'x-forwarded-host': 'evil.test',
          'x-forwarded-port': '8443',
          'x-forwarded-prefix': '/evil',
          'x-real-ip': '192.0.2.1',
          'true-client-ip': '192.0.2.1',
          'x-tuturuuu-runtime': 'native',
          'x-tuturuuu-origin-auth': `hmac-v1;1999999999;192.0.2.1;${'0'.repeat(64)}`,
          'x-tuturuuu-app-base': '/meet',
          'x-tuturuuu-integrity-proof': 'forged',
          'x-tuturuuu-staging-supabase-ref': stagingProfile.supabaseRef,
          'x-vercel-protection-bypass': 'client-guess',
          'x-vercel-set-bypass-cookie': 'samesitenone',
          'x-vercel-ip-country': 'XX',
        },
      }),
      env
    );
    const headers = sent(fetcher).headers;
    for (const name of [
      'cf-access-jwt-assertion',
      'cf-access-authenticated-user-email',
      'cf-access-client-id',
      'cf-access-client-secret',
      'forwarded',
      'x-forwarded-port',
      'x-forwarded-prefix',
      'true-client-ip',
      'x-tuturuuu-runtime',
      'x-tuturuuu-app-base',
      'x-tuturuuu-integrity-proof',
      'x-tuturuuu-staging-supabase-ref',
      'x-vercel-set-bypass-cookie',
      'x-vercel-ip-country',
    ])
      expect(headers.has(name), name).toBe(false);
    expect(headers.get('cookie')).toBe('sb-auth=fixture');
    // Only the Worker's own values remain for the names it owns.
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.10');
    expect(headers.get('x-real-ip')).toBe('203.0.113.10');
    expect(headers.get('x-forwarded-host')).toBe(stagingProfile.host);
    expect(headers.get('x-vercel-protection-bypass')).toBe(bypass);
    const proof = headers.get('x-tuturuuu-origin-auth');
    expect(proof).not.toContain('192.0.2.1');
    expect(verifyOriginClientIpProof({ proof, secret })).toBe('203.0.113.10');
  });

  it('forwards only the two allowlisted client headers, and only bounded values', async () => {
    const { handler, fetcher } = setup();
    const forward = async (headers: Record<string, string>) => {
      await handler(request('/api/v1/x', { headers }), env);
      return sent(fetcher).headers;
    };
    const kept = await forward({
      'x-tuturuuu-turnstile-token': `0.${'A'.repeat(2046)}`,
      'x-tuturuuu-account-action': '1',
    });
    expect(kept.get('x-tuturuuu-turnstile-token')).toHaveLength(2048);
    expect(kept.get('x-tuturuuu-account-action')).toBe('1');
    for (const value of ['A'.repeat(2049), 'has space', 'café', 'tab\tvalue']) {
      const headers = await forward({ 'x-tuturuuu-turnstile-token': value });
      expect(headers.has('x-tuturuuu-turnstile-token'), value).toBe(false);
    }
    expect(
      (await forward({ 'x-tuturuuu-account-action': '1'.repeat(17) })).has(
        'x-tuturuuu-account-action'
      )
    ).toBe(false);
  });

  it('removes Vercel bypass query parameters but keeps every other raw byte', async () => {
    const { handler, fetcher } = setup();
    for (const [query, expected] of [
      ['?a=%2f&x-vercel-protection-bypass=guess&b=1', '?a=%2f&b=1'],
      ['?X-Vercel-Set-Bypass-Cookie=true', ''],
      ['?x%2Dvercel%2Dprotection%2Dbypass=guess&keep=1', '?keep=1'],
      ['?%E0%A4%A=x-vercel&keep=1', '?keep=1'],
      ['?raw=%2f&x=1&x=2', '?raw=%2f&x=1&x=2'],
    ]) {
      await handler(request(`/login${query}`), env);
      expect(sent(fetcher).url).toBe(`${origin}/login${expected}`);
    }
  });
});

describe('Vercel platform state never reaches the browser (N17)', () => {
  function setup(
    _verify?: AccessVerifier,
    upstream: () => Response = () =>
      new Response('Next', {
        headers: {
          [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
        },
      })
  ) {
    const fetcher = vi.fn<Fetcher>(async () => upstream());
    return {
      fetcher,
      handler: (request: Request, _env: WebCandidateEnv) =>
        proxyNext(request, origin, secret, bypass, fetcher),
    };
  }

  it('drops _vercel cookies and x-vercel-* headers and never requests a bypass cookie', async () => {
    const { handler, fetcher } = setup(undefined, () => {
      const headers = new Headers({
        [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
        'x-vercel-id': 'sin1::abc',
        'x-vercel-cache': 'MISS',
      });
      headers.append(
        'set-cookie',
        '_vercel_jwt=token; Path=/; Secure; HttpOnly'
      );
      headers.append('set-cookie', '_vercel_session=x; Path=/');
      headers.append(
        'set-cookie',
        'sb-auth.0=one; Domain=.staging.tutur3u.com; Path=/; Secure'
      );
      return new Response('Next', { headers });
    });
    const response = await handler(request('/login'), env);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      'sb-auth.0=one; Domain=.staging.tutur3u.com; Path=/; Secure',
    ]);
    expect(
      [...response.headers.keys()].filter((n) => n.startsWith('x-vercel-'))
    ).toEqual([]);
    expect(sent(fetcher).headers.has('x-vercel-set-bypass-cookie')).toBe(false);
  });
});
