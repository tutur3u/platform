import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isRoadmapPath, serveRoadmap } from './roadmap-bridge.ts';

const origin = 'https://roadmap.synthetic.workers.dev';
const request = (path = '/roadmap/', init) =>
  new Request(`https://tuturuuu.com${path}`, init);

test('only the exact mount and slash descendants are admitted', () => {
  for (const path of ['/roadmap', '/roadmap/', '/roadmap/assets/icon.svg']) {
    assert.equal(isRoadmapPath(path), true);
  }
  for (const path of ['/roadmapper', '/roadmap-other', '/en/roadmap', '/api']) {
    assert.equal(isRoadmapPath(path), false);
  }
});

test('GET preserves the mount/query and strips all credentials in both directions', async () => {
  let calls = 0;
  const response = await serveRoadmap({
    origin,
    request: request('/roadmap/?view=active', {
      headers: {
        Cookie: 'session=synthetic',
        Authorization: 'Bearer synthetic',
        'Proxy-Authorization': 'synthetic',
        'X-App-Session': 'synthetic',
        'X-Forwarded-Host': 'private.invalid',
        Accept: 'text/html',
        'Accept-Language': 'vi',
        'X-Middleware-Override-Headers': 'cookie',
      },
    }),
    fetcher: async (url, options) => {
      calls++;
      assert.equal(String(url), `${origin}/roadmap/?view=active`);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.deepEqual([...options.headers.keys()].sort(), [
        'accept',
        'accept-encoding',
        'accept-language',
      ]);
      assert.equal(options.headers.get('accept'), 'text/html');
      return new Response('public roadmap', {
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': 'synthetic=true',
          'Cache-Control': 'public, s-maxage=3600',
          'CDN-Cache-Control': 'public',
          'Vercel-CDN-Cache-Control': 'public',
          'X-Middleware-Rewrite': 'https://private.invalid',
          'Content-Encoding': 'gzip',
        },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'public roadmap');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-middleware-rewrite'), null);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
});

test('HEAD has no body and asset paths stay under the mount', async () => {
  const response = await serveRoadmap({
    origin,
    request: request('/roadmap/assets/icon.svg', { method: 'HEAD' }),
    fetcher: async (url, options) => {
      assert.equal(String(url), `${origin}/roadmap/assets/icon.svg`);
      assert.equal(options.method, 'HEAD');
      return new Response('not forwarded');
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('unsupported methods and invalid origins never reach the network', async () => {
  const fetcher = async () => {
    assert.fail('must not fetch');
  };
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await serveRoadmap({
      origin,
      request: request('/roadmap', { method }),
      fetcher,
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
  for (const value of [
    '',
    'http://roadmap.synthetic.workers.dev',
    'https://evil.invalid',
    `${origin}/path`,
    `${origin}?q=1`,
    'https://user:pass@roadmap.synthetic.workers.dev',
    'https://roadmap.synthetic.workers.dev:444',
    'https://roadmap.synthetic.workers.dev.evil.invalid',
  ]) {
    assert.equal(
      (await serveRoadmap({ origin: value, request: request(), fetcher }))
        .status,
      503
    );
  }
  assert.equal(
    (await serveRoadmap({ origin, request: request('/roadmapper'), fetcher }))
      .status,
    404
  );
});

test('redirects remain local to the same origin and roadmap mount', async () => {
  for (const location of [
    '/roadmap/next?x=1#section',
    `${origin}/roadmap/next?x=1#section`,
  ]) {
    const response = await serveRoadmap({
      origin,
      request: request(),
      fetcher: async () =>
        new Response(null, { status: 307, headers: { Location: location } }),
    });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/roadmap/next?x=1#section');
  }
  for (const location of [
    'https://evil.invalid/roadmap',
    '/account',
    '/roadmapper',
    '/roadmap/%2e%2e/account',
    '/roadmap/%2faccount',
    '//evil.invalid/roadmap',
  ]) {
    let calls = 0;
    const response = await serveRoadmap({
      origin,
      request: request(),
      fetcher: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { Location: location },
        });
      },
    });
    assert.equal(response.status, 502, location);
    assert.equal(calls, 1);
    assert.equal(response.headers.get('location'), null);
  }
});

test('failures, oversized declared/streamed bodies and broken streams fail closed', async () => {
  const suppliers = [
    async () => {
      throw new Error('synthetic network failure');
    },
    async () => new Response('unavailable', { status: 503 }),
    async () => new Response(null, { status: 302 }),
    async () =>
      new Response('large', { headers: { 'Content-Length': '8388609' } }),
    async () => new Response(new Uint8Array(8388609)),
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error('broken'));
          },
        })
      ),
  ];
  for (const fetcher of suppliers) {
    const response = await serveRoadmap({
      origin,
      request: request(),
      fetcher,
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(await response.text(), '');
  }
});

test('timeout aborts a stalled upstream without retries or fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let calls = 0;
  const pending = serveRoadmap({
    origin,
    request: request(),
    fetcher: async (_url, options) => {
      calls++;
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  t.mock.timers.tick(8000);
  assert.equal((await pending).status, 502);
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test('proxy admits assets explicitly and branches before auth and locale', () => {
  const source = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function webProxy('));
  assert.ok(
    body.indexOf('isRoadmapPath(req.nextUrl.pathname)') <
      body.indexOf('await authProxy(req)')
  );
  assert.ok(body.indexOf('serveRoadmap(') < body.indexOf('handleLocale('));
  assert.ok(source.includes("'/roadmap/:path*'"));
  assert.ok(source.includes('withStagingOriginProof('));
});

test('bare mount canonicalizes locally while preserving query without a fetch', async () => {
  const response = await serveRoadmap({
    origin,
    request: request('/roadmap?view=active'),
    fetcher: async () => {
      assert.fail('must not fetch');
    },
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/roadmap/?view=active');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
