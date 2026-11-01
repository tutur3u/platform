// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GatewayEnvironment, gatewayRequest } from './gateway-worker';

const template =
  '<html lang="en"><head><title>Tuturuuu Apps</title><!--gateway-metadata--></head><body><div id="root"></div></body></html>';
function environment() {
  const fetch = vi.fn(async () => new Response(template));
  return {
    ASSETS: { fetch },
    SOURCE_SHA: 'a'.repeat(40),
  } satisfies GatewayEnvironment;
}
const request = (path: string, init?: RequestInit) =>
  new Request(`https://gateway.example.test${path}`, init);

beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));
afterEach(() => vi.unstubAllEnvs());

describe('additive public Apps Worker', () => {
  it('uses only allowlisted destinations, preserving path encoding, repeat query and source', async () => {
    const result = await gatewayRequest(
      request('/pay/a%2Fb?tag=x&tag=y'),
      environment()
    );
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toBe(
      'https://pay.tuturuuu.com/a%2Fb?tag=x&tag=y&source=apps'
    );
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(result.headers.get('x-frame-options')).toBe('DENY');
    expect(result.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
  });
  it('retains an explicit source and never selects the redirect origin from query', async () => {
    const result = await gatewayRequest(
      request('/pay?source=sidebar&url=https%3A%2F%2Fevil.test'),
      environment()
    );
    expect(result.headers.get('location')).toBe(
      'https://pay.tuturuuu.com/?source=sidebar&url=https%3A%2F%2Fevil.test'
    );
  });
  it('resolves a real catalogue alias', async () => {
    const result = await gatewayRequest(request('/Meeting'), environment());
    expect(result.headers.get('location')).toBe(
      'https://meet.tuturuuu.com/?source=apps'
    );
  });
  it.each(['/not-an-app', '//evil.test/path', '/%ZZ', '/api/private'])(
    'rejects unowned route %s without an asset fallback',
    async (path) => {
      const env = environment();
      const result = await gatewayRequest(request(path), env);
      expect([400, 404]).toContain(result.status);
      expect(result.headers.has('location')).toBe(false);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  );
  it('canonicalizes explicit locale without losing repeated query or encoded path', async () => {
    const result = await gatewayRequest(
      request('/vi/pay/a%2Fb?tag=1&tag=2'),
      environment()
    );
    expect(result.headers.get('location')).toBe(
      'https://gateway.example.test/pay/a%2Fb?tag=1&tag=2'
    );
    expect(result.headers.get('set-cookie')).toBe(
      'NEXT_LOCALE=vi; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
    );
  });
  it('serves Vietnamese HTML with hydrated catalogue content before scripts run', async () => {
    const result = await gatewayRequest(
      request('/', { headers: { cookie: 'NEXT_LOCALE=vi' } }),
      environment()
    );
    const body = await result.text();
    expect(body).toContain('<html lang="vi">');
    expect(body).toContain('Mọi ứng dụng công việc cần.');
    expect(body).toContain('href="/pay"');
    expect(body).not.toContain('<div id="root"></div>');
    expect(result.headers.get('vary')).toContain('Cookie');
  });
  it('prioritizes a saved English locale over a different language header', async () => {
    const result = await gatewayRequest(
      request('/', {
        headers: { cookie: 'NEXT_LOCALE=en', 'accept-language': 'vi-VN' },
      }),
      environment()
    );
    expect(await result.text()).toContain('<html lang="en">');
  });
  it('uses language header for a fresh visitor', async () => {
    const result = await gatewayRequest(
      request('/', { headers: { 'accept-language': 'vi-VN, en;q=0.8' } }),
      environment()
    );
    expect(await result.text()).toContain('<html lang="vi">');
  });
  it.each(['tuturuuu_app_session=fixture', 'sb-fixture-auth-token.0=fixture'])(
    'preserves original account route for cookie %s',
    async (cookie) => {
      const env = environment();
      const result = await gatewayRequest(
        request('//evil.test?source=fixture', { headers: { cookie } }),
        env
      );
      expect(result.headers.get('location')).toBe(
        'https://apps.tuturuuu.com//evil.test?source=fixture'
      );
      expect(new URL(result.headers.get('location') ?? '').origin).toBe(
        'https://apps.tuturuuu.com'
      );
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  );
  it('does not infer authorization from an explicit credential', async () => {
    const result = await gatewayRequest(
      request('/?a=1', { headers: { authorization: '' } }),
      environment()
    );
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toBe(
      'https://apps.tuturuuu.com/?a=1'
    );
  });
  it('rejects production-host activation and mutation methods', async () => {
    expect(
      (
        await gatewayRequest(
          new Request('https://apps.tuturuuu.com/'),
          environment()
        )
      ).status
    ).toBe(503);
    expect(
      (await gatewayRequest(request('/', { method: 'POST' }), environment()))
        .status
    ).toBe(405);
  });
  it('reports only supplied source evidence and applies HEAD semantics', async () => {
    const result = await gatewayRequest(
      request('/api/build-info'),
      environment()
    );
    expect(await result.json()).toEqual({
      app: 'apps',
      runtime: 'vite-cloudflare-staging',
      sourceSha: 'a'.repeat(40),
      fullAppPort: false,
    });
    const head = await gatewayRequest(
      request('/api/build-info', { method: 'HEAD' }),
      environment()
    );
    expect(await head.text()).toBe('');
  });
  it('returns unavailable for missing catalogue assets', async () => {
    const env = {
      ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    };
    expect((await gatewayRequest(request('/'), env)).status).toBe(503);
  });
  it('fails closed when the expected SSR placeholder is missing or asset lookup throws', async () => {
    expect(
      (
        await gatewayRequest(request('/'), {
          ASSETS: { fetch: async () => new Response('<html></html>') },
        })
      ).status
    ).toBe(503);
    expect(
      (
        await gatewayRequest(request('/'), {
          ASSETS: {
            fetch: async () => {
              throw new Error('fixture');
            },
          },
        })
      ).status
    ).toBe(503);
  });
  it('delegates only owned asset paths without reinterpreting an asset error as HTML', async () => {
    const fetch = vi.fn(async () => new Response('missing', { status: 404 }));
    const result = await gatewayRequest(request('/assets/missing.js'), {
      ASSETS: { fetch },
    });
    expect(result.status).toBe(404);
    expect(await result.text()).toBe('missing');
    expect(fetch).toHaveBeenCalledOnce();
  });
});

it.each([
  ['apps.tutur3u.com', 500],
  ['gateway.example.test', 200],
])('enforces outgoing cookie scope on %s', async (host, status) => {
  const env = environment();
  const cookie = 'session=fixture; Domain=.tuturuuu.com; Path=/; Secure';
  env.ASSETS.fetch.mockResolvedValueOnce(
    new Response('asset', { headers: { 'set-cookie': cookie } })
  );
  const result = await gatewayRequest(
    new Request(`https://${host}/assets/example.js`),
    env
  );
  expect(result.status).toBe(status);
  expect(result.headers.getSetCookie()).toEqual(status === 500 ? [] : [cookie]);
});
