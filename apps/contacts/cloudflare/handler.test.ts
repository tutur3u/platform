// @vitest-environment node
import { resolveClientIp } from '@tuturuuu/utils/abuse-protection/client-ip';
import { verifyOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './fallback';
import { createContactsCandidateHandler } from './handler';
import { type ContactsCandidateEnv, stagingProfile } from './profile';

const secret = 'disposable-test-origin-proof-key-123456';
const origin = 'https://tuturuuu-next-fixture.vercel.app';
const env: ContactsCandidateEnv = {
  CONTACTS_START_CANDIDATE: 'staging',
  NEXT_FALLBACK_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_DOMAIN: stagingProfile.cookieDomain,
  TRUSTED_PROXY_ORIGIN_SECRET: secret,
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
    handler: createContactsCandidateHandler({ fetcher, start }),
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

describe('Contacts candidate admission', () => {
  it.each([undefined, '', 'on', 'true', 'off', 'unknown'])(
    'defaults closed for %s',
    async (flag) => {
      const { handler, fetcher, start } = setup();
      expect(
        (
          await handler(request('/login'), {
            ...env,
            CONTACTS_START_CANDIDATE: flag,
          })
        ).status
      ).toBe(503);
      expect(fetcher).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  );
  it.each([
    'https://tuturuuu.com',
    'https://other.tutur3u.com',
    'https://contacts.tutur3u.com.evil.test',
    'http://contacts.tutur3u.com',
    'https://contacts.tutur3u.com:444',
  ])('rejects host %s', async (host) => {
    const { handler, fetcher } = setup();
    expect((await handler(new Request(`${host}/`), env)).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    '',
    base,
    'https://tuturuuu.com',
    'https://web.tuturuuu.com',
    'https://evil.test',
    'https://drive-next-fixture.vercel.app',
    'https://eviltuturuuu-next.vercel.app',
    'https://tuturuuu-next.vercel.app.evil.test',
    'https://nested.tuturuuu-next.vercel.app',
    `${origin}/path`,
    `${origin}/?a=1`,
    'http://tuturuuu-next-fixture.vercel.app',
    'https://user:pass@tuturuuu-next-fixture.vercel.app',
  ])('rejects upstream %s', async (upstream) => {
    const { handler, fetcher } = setup();
    expect(
      (await handler(request('/'), { ...env, NEXT_FALLBACK_ORIGIN: upstream }))
        .status
    ).toBe(503);
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
  it('admits only the exact Start probe; all other paths go to Next', async () => {
    const { handler, fetcher, start } = setup();
    expect((await handler(request('/__contacts1'), env)).status).toBe(200);
    expect(start).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    for (const path of [
      '/__contacts1/child',
      '/_serverFn/a',
      '/_next/static/a',
      '/__contacts1/',
      '/en/ws/users/tutoring',
      '/vi/ws/users/feedbacks',
      '/api/v1/workspaces/ws/users/feedbacks',
      '/api/payments',
      '/api/v1/workspaces/ws/settings/permissions',
      '/api/auth/refresh-app-session',
      '/robots.txt',
    ])
      await handler(request(path), env);
    await handler(request('/__contacts1', { method: 'POST' }), env);
    expect(fetcher).toHaveBeenCalledTimes(12);
    expect(start).toHaveBeenCalledOnce();
  });
  it('requires an attested staging Next project on every response', async () => {
    const { handler } = setup(() => new Response('production'));
    const response = await handler(request('/'), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('production');
  });
});

describe('Next fallback compatibility', () => {
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
    expect(response.headers.get('strict-transport-security')).toBe(
      stagingProfile.hsts
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
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
    expect(response.headers.get('cache-control')).toBe('no-store');
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
  it('returns bounded 502 without retrying failed writes', async () => {
    const { handler, fetcher } = setup(async () => {
      throw new Error('private origin detail');
    });
    const response = await handler(
      request('/api/a', { method: 'POST', body: 'one write' }),
      env
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private origin detail');
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
  it('propagates request cancellation into the single Next fallback fetch', async () => {
    const abort = new AbortController();
    const { handler, fetcher } = setup();
    await handler(request('/ws/users/tutoring', { signal: abort.signal }), env);
    expect(forwarded(fetcher).signal.aborted).toBe(false);
    abort.abort();
    expect(forwarded(fetcher).signal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('stops all further downstream work after the durable flag switches off', async () => {
    const { handler, fetcher, start } = setup();
    await handler(request('/ws/users/tutoring'), env);
    expect(fetcher).toHaveBeenCalledOnce();
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await handler(request('/ws/users/tutoring'), {
            ...env,
            CONTACTS_START_CANDIDATE: 'off',
          })
        ).status
      ).toBe(503);
      expect(
        (
          await handler(request('/__contacts1'), {
            ...env,
            CONTACTS_START_CANDIDATE: 'off',
          })
        ).status
      ).toBe(503);
    }
    expect(fetcher).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
  it('forwards HEAD without a response body', async () => {
    const { handler, fetcher } = setup();
    const response = await handler(request('/login', { method: 'HEAD' }), env);
    expect(forwarded(fetcher).method).toBe('HEAD');
    expect(await response.text()).toBe('');
  });
});
