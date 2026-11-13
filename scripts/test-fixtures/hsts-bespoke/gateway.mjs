import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWorker } from './gateway-loader.mjs';

const secured = (response) =>
  assert.deepEqual(
    [...response.headers].filter(
      ([key]) => key === 'strict-transport-security'
    ),
    [['strict-transport-security', 'max-age=63072000']]
  );
for (const [host, path, status, env] of [
  ['apps.tuturuuu.com', '/', 503, {}],
  ['gateway.example.test', '/api/build-info', 200, {}],
  ['gateway.example.test', '/api/private', 404, {}],
  ['gateway.example.test', '/', 503, {}],
  [
    'gateway.example.test',
    '/',
    503,
    { ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } },
  ],
  ['gateway.example.test', '/%ZZ', 400, {}],
]) {
  test(`gateway ${host}${path} status ${status}`, async () => {
    const worker = await loadWorker('apps');
    const result = await worker.fetch(
      new Request(`https://${host}${path}`),
      env
    );
    assert.equal(result.status, status);
    secured(result);
  });
}
test('gateway locale redirect preserves location, cookie and HEAD body', async () => {
  const worker = await loadWorker('apps');
  const result = await worker.fetch(
    new Request('https://gateway.example.test/vi/pay?x=1&x=2', {
      method: 'HEAD',
    }),
    {}
  );
  assert.equal(result.status, 307);
  assert.equal(
    result.headers.get('location'),
    'https://gateway.example.test/pay?x=1&x=2'
  );
  assert.deepEqual(result.headers.getSetCookie(), [
    'NEXT_LOCALE=vi; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
  ]);
  assert.equal(await result.text(), '');
  secured(result);
});
test('gateway asset binding preserves request and hostile response after cookie wrapper', async () => {
  const worker = await loadWorker('apps');
  const request = new Request('https://gateway.example.test/assets/x?q=1', {
    headers: { cookie: 'fixture=1', origin: 'https://origin.test' },
  });
  const binding = {
    async fetch(input) {
      assert.equal(this, binding);
      assert.equal(input, request);
      return new Response('asset', {
        status: 302,
        headers: [
          ['Strict-Transport-Security', 'max-age=1; preload'],
          ['strict-transport-security', 'max-age=2'],
          ['Location', '/asset-destination'],
          ['Set-Cookie', 'one=1; Path=/'],
          ['Set-Cookie', 'two=2; Path=/'],
          ['Cache-Control', 'public, max-age=60'],
          ['Access-Control-Allow-Origin', 'https://origin.test'],
        ],
      });
    },
  };
  const result = await worker.fetch(request, { ASSETS: binding });
  assert.equal(result.status, 302);
  assert.equal(await result.text(), 'asset');
  assert.equal(result.headers.get('location'), '/asset-destination');
  assert.equal(result.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(
    result.headers.get('access-control-allow-origin'),
    'https://origin.test'
  );
  assert.deepEqual(result.headers.getSetCookie(), [
    'one=1; Path=/',
    'two=2; Path=/',
  ]);
  secured(result);
});
test('gateway thrown asset binding yields secured error', async () => {
  const worker = await loadWorker('apps');
  const result = await worker.fetch(
    new Request('https://gateway.example.test/assets/x'),
    {
      ASSETS: {
        fetch: async () => {
          throw new Error('fixture');
        },
      },
    }
  );
  assert.equal(result.status, 500);
  assert.equal(await result.text(), 'Internal Server Error');
  secured(result);
});
