import { resolveClientIp } from '@tuturuuu/utils/abuse-protection/client-ip';
import { verifyOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { describe, expect, it, vi } from 'vitest';
import { type Fetcher, proxyNext } from './fallback';
import { createWebCandidateHandler } from './handler';
import { stagingProfile, type WebCandidateEnv } from './profile';

const secret = 'disposable-test-origin-proof-key-123456';
const origin = 'https://tuturuuu-next-fixture.vercel.app';
const env: WebCandidateEnv = {
  WEB_START_CANDIDATE: 'staging',
  NEXT_FALLBACK_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_DOMAIN: stagingProfile.cookieDomain,
  TRUSTED_PROXY_ORIGIN_SECRET: secret,
  VERCEL_AUTOMATION_BYPASS_SECRET: 'test-bypass-secret-00000000000000000000',
  CF_ACCESS_TEAM_DOMAIN: 'fixture-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'fixture-aud',
};
const base = `https://${stagingProfile.host}`;
function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('cf-connecting-ip', '203.0.113.10');
  return new Request(`${base}${path}`, { ...init, headers });
}
function reply(body: BodyInit | null = 'Next', init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set(stagingProfile.upstreamProjectHeader, stagingProfile.supabaseRef);
  return new Response(body, { ...init, headers });
}
function setup(response: () => Response | Promise<Response> = () => reply()) {
  const fetcher = vi.fn<Fetcher>(async () => response());
  const start = vi.fn(async () => Response.json({ status: 'candidate' }));
  return {
    // Access JWT verification is covered in access-hardening.test.ts.
    handler: createWebCandidateHandler({
      fetcher,
      start,
      verifyAccess: async () => true,
    }),
    fetcher,
    start,
  };
}
function forwarded(fetcher: ReturnType<typeof setup>['fetcher']) {
  const input = fetcher.mock.calls[0]?.[0];
  if (!(input instanceof Request))
    throw new Error('Expected a forwarded Request');
  return input;
}

describe('Web candidate admission', () => {
  it.each([undefined, '', 'on', 'true', 'off', 'unknown'])(
    'defaults closed for %s',
    async (flag) => {
      const { handler, fetcher, start } = setup();
      expect(
        (
          await handler(request('/login'), {
            ...env,
            WEB_START_CANDIDATE: flag,
          })
        ).status
      ).toBe(503);
      expect(fetcher).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  );
  it.each([
    'https://tuturuuu.com',
    'https://other.staging.tutur3u.com',
    'https://web.staging.tutur3u.com.evil.test',
    'http://web.staging.tutur3u.com',
    'https://web.staging.tutur3u.com:444',
  ])('rejects host %s', async (host) => {
    const { handler, fetcher } = setup();
    expect((await handler(new Request(`${host}/`), env)).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' },
    { AUTH_COOKIE_DOMAIN: '.tuturuuu.com' },
    { TRUSTED_PROXY_ORIGIN_SECRET: 'short' },
  ])('rejects unsafe identity %j', async (override) => {
    const { handler, fetcher } = setup();
    expect((await handler(request('/'), { ...env, ...override })).status).toBe(
      503
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serves only the probe natively and returns a static 404 without upstream inputs', async () => {
    const { handler, fetcher, start } = setup();
    const nativeEnv = {
      ...env,
      WEB_STAGING_SOURCE_SHA: 'a'.repeat(40),
      NEXT_FALLBACK_ORIGIN: undefined,
      VERCEL_AUTOMATION_BYPASS_SECRET: undefined,
    };
    expect((await handler(request('/__web1'), nativeEnv)).status).toBe(200);
    for (const path of ['/login', '/api/a', '/_next/static/a', '/__web1/']) {
      const response = await handler(request(path), nativeEnv);
      expect(response.status).toBe(404);
      expect(response.headers.get('x-tuturuuu-source-sha')).toBe(
        'a'.repeat(40)
      );
      expect(response.headers.get('x-tuturuuu-native')).toBe('not-migrated');
      expect(response.headers.get('cache-control')).toBe('no-store');
      const html = await response.text();
      expect(html).toContain('Not migrated yet');
      expect(html).toContain('<meta name="color-scheme" content="light dark">');
      expect(html).toContain('noindex');
      expect(html).not.toMatch(/<script|src=|href=/);
    }
    expect(
      await (
        await handler(request('/login', { method: 'HEAD' }), nativeEnv)
      ).text()
    ).toBe('');
    expect(fetcher).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledOnce();
  });
  it.each([
    undefined,
    'not a URL',
    'https://tuturuuu.com',
    'https://untrusted.example',
  ])('ignores stale fallback origin %s in staging', async (fallback) => {
    const { handler, fetcher } = setup();
    const response = await handler(request('/login'), {
      ...env,
      NEXT_FALLBACK_ORIGIN: fallback,
      VERCEL_AUTOMATION_BYPASS_SECRET: undefined,
    });
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps the production host disabled in this isolated staging candidate', async () => {
    const { handler, fetcher, start } = setup();
    expect(
      (await handler(new Request('https://tuturuuu.com/login'), env)).status
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});

describe('retained forwarding helper compatibility', () => {
  function setup(response: () => Response | Promise<Response> = () => reply()) {
    const fetcher = vi.fn<Fetcher>(async () => response());
    const start = vi.fn();
    const handler = (input: Request, _env: WebCandidateEnv) =>
      proxyNext(
        input,
        origin,
        secret,
        'test-bypass-secret-00000000000000000000',
        fetcher
      );
    return { fetcher, start, handler };
  }
  it('retains raw queries, encoded paths, server actions and session headers', async () => {
    const { handler, fetcher } = setup();
    const headers = {
      cookie: 'sb-staging-auth-token.0=one; sb-staging-auth-token.1=two',
      authorization: 'Bearer disposable-test-token',
      origin: base,
      'next-action': 'action-id',
      'next-router-state-tree': '%5B%22%22%5D',
      rsc: '1',
      'x-cron-secret': 'test-cron',
      'x-webhook-secret': 'test-webhook',
      'x-tuturuuu-turnstile-token': 'test-turnstile',
      'x-middleware-rewrite': '/vi/login',
      'content-type': 'text/plain',
      'cf-ray': 'fixture-ray',
    };
    const response = await handler(
      request('/api/v1/a%2Fb?x=1&x=2&raw=%2f+%20', {
        method: 'POST',
        headers,
        body: 'action\nbytes',
      }),
      env
    );
    expect(response.status).toBe(200);
    const upstream = forwarded(fetcher);
    expect(upstream.url).toBe(`${origin}/api/v1/a%2Fb?x=1&x=2&raw=%2f+%20`);
    expect(upstream.redirect).toBe('manual');
    expect(upstream.method).toBe('POST');
    expect(await upstream.text()).toBe('action\nbytes');
    for (const [name, value] of Object.entries(headers))
      expect(upstream.headers.get(name)).toBe(value);
  });
  it('signs the Cloudflare client IP and overwrites caller origin-auth and forwarded IP claims', async () => {
    const { handler, fetcher } = setup();
    await handler(
      request('/', {
        headers: {
          'x-tuturuuu-origin-auth': 'spoofed',
          forwarded: 'for=192.0.2.99;host=evil.test;proto=http',
          'true-client-ip': '192.0.2.99',
          'x-vercel-forwarded-for': '192.0.2.99',
          'x-vercel-ip-country': 'XX',
          'x-vercel-cron-secret': 'spoofed',
          'x-forwarded-for': '192.0.2.99',
          'x-real-ip': '192.0.2.99',
          'x-forwarded-host': 'evil.test',
        },
      }),
      env
    );
    const headers = forwarded(fetcher).headers;
    expect(headers.get('x-tuturuuu-origin-auth')).not.toBe(secret);
    expect(
      verifyOriginClientIpProof({
        proof: headers.get('x-tuturuuu-origin-auth'),
        secret,
      })
    ).toBe('203.0.113.10');
    expect(
      resolveClientIp(headers, {
        mode: 'cloudflare-origin',
        trustedHops: 1,
        originAuthSecret: secret,
      })
    ).toBe('203.0.113.10');
    for (const name of [
      'forwarded',
      'true-client-ip',
      'cf-connecting-ip',
      'x-vercel-forwarded-for',
      'x-vercel-ip-country',
      'x-vercel-cron-secret',
    ])
      expect(headers.has(name)).toBe(false);
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.10');
    expect(headers.get('x-real-ip')).toBe('203.0.113.10');
    expect(headers.get('x-forwarded-host')).toBe(stagingProfile.host);
    expect(headers.get('x-forwarded-proto')).toBe('https');
  });
  it('refuses to manufacture an IP when Cloudflare identity is missing', async () => {
    const { handler, fetcher } = setup();
    expect(
      (
        await handler(
          new Request(`${base}/`, {
            headers: { 'x-forwarded-for': '192.0.2.1' },
          }),
          env
        )
      ).status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps rotated session cookies separately and preserves rewrite/security headers', async () => {
    const cookies = [
      'sb-auth.0=rotated; Domain=.staging.tutur3u.com; Path=/; Secure; HttpOnly; SameSite=Lax',
      '__Host-csrf=token; Path=/; Secure; SameSite=Strict',
    ];
    const headers = new Headers({
      'x-middleware-rewrite': '/vi/login',
      'content-security-policy': "default-src 'self'",
      vary: 'RSC, Cookie',
    });
    for (const cookie of cookies) headers.append('set-cookie', cookie);
    const { handler } = setup(() => reply('auth', { headers }));
    const response = await handler(request('/login'), env);
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(response.headers.get('x-middleware-rewrite')).toBe('/vi/login');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'"
    );
    expect(response.headers.get('vary')).toBe('RSC, Cookie');
  });
  it.each([
    'Domain=.staging.tutur3u.com; Domain=.tutur3u.com',
    'Domain=.tutur3u.com; Domain=.staging.tutur3u.com',
    'dOmAiN = .staging.tutur3u.com; DOMAIN\t=\t.tutur3u.com',
    'Domain=.staging.tutur3u.com; Domain=.staging.tutur3u.com',
    'DOMAIN=.staging.tutur3u.com; domain = .staging.tutur3u.com',
    'Domain=.staging.tutur3u.com; Domain=; Domain=.tutur3u.com',
    'Domain=; Domain=.staging.tutur3u.com',
  ])('rejects ambiguous cookie domains: %s', async (attributes) => {
    const headers = new Headers();
    headers.append('set-cookie', '__Host-safe=fixture; Path=/; Secure');
    headers.append('set-cookie', `sb-auth=fixture; ${attributes}; Secure`);
    const { handler } = setup(() => reply('upstream auth body', { headers }));
    const response = await handler(request('/login'), env);
    expect(response.status).toBe(502);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.text()).toBe('Upstream cookie domain rejected');
  });
  it.each(['Domain=.staging.tutur3u.com', 'dOmAiN\t=\t.STAGING.TUTUR3U.COM  '])(
    'preserves a single staging cookie domain: %s',
    async (attributes) => {
      const cookie = `sb-auth=fixture; ${attributes}; Secure`;
      const { handler } = setup(() =>
        reply('auth', { headers: { 'set-cookie': cookie } })
      );
      const response = await handler(request('/login'), env);
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([cookie]);
      expect(await response.text()).toBe('auth');
    }
  );
  it('rejects production cookie domains', async () => {
    const { handler } = setup(() =>
      reply('auth', {
        headers: {
          'set-cookie': 'sb-auth=secret; Domain=.tuturuuu.com; Secure',
        },
      })
    );
    const response = await handler(request('/'), env);
    expect(response.status).toBe(502);
    expect(response.headers.has('set-cookie')).toBe(false);
  });
  it.each([
    '/api/v1/workspaces/ws/calendar/events',
    '/api/v1/infrastructure/ai/models',
    '/vi/ws/drive',
    '/ws/users',
    '/vi/shared/forms/code',
  ])('keeps Next ownership for %s', async (path) => {
    const { handler, fetcher, start } = setup();
    await handler(request(path), env);
    expect(forwarded(fetcher).url).toBe(`${origin}${path}`);
    expect(start).not.toHaveBeenCalled();
  });
  it('rewrites only upstream-origin redirects without following them', async () => {
    const { handler } = setup(() =>
      reply(null, {
        status: 307,
        headers: { location: `${origin}/login?a=1&a=2` },
      })
    );
    const response = await handler(request('/ws'), env);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${base}/login?a=1&a=2`);
    const external = setup(() =>
      reply(null, {
        status: 308,
        headers: { location: 'https://contacts.tuturuuu.com/ws' },
      })
    );
    expect(
      (await external.handler(request('/ws/users'), env)).headers.get(
        'location'
      )
    ).toBe('https://contacts.tuturuuu.com/ws');
  });
  it('preserves the root service-worker scope and script bytes through Next', async () => {
    const { handler, fetcher } = setup(() =>
      reply('self.scope = "/";', {
        headers: {
          'service-worker-allowed': '/',
          'content-type': 'application/javascript',
          etag: '"sw-v1"',
        },
      })
    );
    const response = await handler(
      request('/serwist/sw.js?v=release', {
        headers: { 'service-worker': 'script' },
      }),
      env
    );
    expect(forwarded(fetcher).url).toBe(`${origin}/serwist/sw.js?v=release`);
    expect(forwarded(fetcher).headers.get('service-worker')).toBe('script');
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('etag')).toBe('"sw-v1"');
    expect(await response.text()).toBe('self.scope = "/";');
  });
  it('streams before the upstream closes and propagates stream failure', async () => {
    let producer: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        producer = controller;
        controller.enqueue(new TextEncoder().encode('first'));
      },
    });
    const { handler } = setup(() =>
      reply(stream, { headers: { 'content-type': 'text/event-stream' } })
    );
    const response = await handler(request('/api/ai/stream'), env);
    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe(
      'first'
    );
    producer?.error(new Error('upstream stream failed'));
    await expect(reader?.read()).rejects.toThrow('upstream stream failed');
  });
  it.each([401, 403, 404, 429, 500, 503])(
    'preserves upstream error %s and retry headers',
    async (status) => {
      const { handler } = setup(() =>
        reply('upstream error body', {
          status,
          headers: { 'retry-after': '7', 'x-request-id': 'fixture-id' },
        })
      );
      const response = await handler(request('/api/a'), env);
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('upstream error body');
      expect(response.headers.get('retry-after')).toBe('7');
    }
  );
  it('does not retry failed writes in the retained proxy', async () => {
    const { handler, fetcher } = setup(async () => {
      throw new Error('private origin detail');
    });
    await expect(
      handler(request('/api/a', { method: 'POST', body: 'one write' }), env)
    ).rejects.toThrow('private origin detail');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('removes hop-by-hop headers including Connection nominations', async () => {
    const { handler, fetcher } = setup(() =>
      reply('ok', {
        headers: { connection: 'x-response-hop', 'x-response-hop': 'private' },
      })
    );
    const response = await handler(
      request('/', {
        headers: {
          connection: 'x-request-hop',
          'x-request-hop': 'private',
          host: 'spoof.test',
        },
      }),
      env
    );
    expect(forwarded(fetcher).headers.has('x-request-hop')).toBe(false);
    expect(forwarded(fetcher).headers.has('host')).toBe(false);
    expect(response.headers.has('x-response-hop')).toBe(false);
  });
});
