import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkTargets,
  DEFAULT_TARGETS,
  vercelMarkers,
} from './vercel-free-smoke.mjs';

test('flags 402, x-vercel-* headers and a Vercel server', () => {
  assert.deepEqual(
    vercelMarkers({
      status: 402,
      headers: new Headers({
        server: 'Vercel',
        'x-vercel-error': 'DEPLOYMENT_DISABLED',
        'x-vercel-id': 'sin1::abc',
      }),
    }).sort(),
    [
      'server: Vercel',
      'status 402',
      'x-vercel-error: DEPLOYMENT_DISABLED',
      'x-vercel-id: sin1::abc',
    ]
  );
});

test('accepts Cloudflare responses, including redirects and auth errors', () => {
  for (const status of [200, 301, 307, 401, 404]) {
    assert.deepEqual(
      vercelMarkers({
        status,
        headers: new Headers({
          server: 'cloudflare',
          'x-gateway-family': 'api-core',
        }),
      }),
      []
    );
  }
  assert.deepEqual(
    vercelMarkers({ status: 200, headers: { server: 'cloudflare' } }),
    []
  );
});

test('checks each target once without following redirects', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    return url.includes('bad')
      ? new Response('Payment required', {
          status: 402,
          headers: { 'x-vercel-error': 'DEPLOYMENT_DISABLED' },
        })
      : new Response(null, { status: 301, headers: { server: 'cloudflare' } });
  };
  const results = await checkTargets(
    ['https://good.example/', 'https://bad.example/'],
    fetchImpl
  );
  assert.deepEqual(
    calls.map((call) => call.redirect),
    ['manual', 'manual']
  );
  assert.deepEqual(results[0].markers, []);
  assert.ok(results[1].markers.includes('status 402'));
});

test('default targets are HTTPS tuturuuu.com hosts', () => {
  for (const url of DEFAULT_TARGETS) {
    const host = new URL(url).hostname;
    assert.ok(host === 'tuturuuu.com' || host.endsWith('.tuturuuu.com'), url);
    assert.equal(new URL(url).protocol, 'https:');
  }
});
