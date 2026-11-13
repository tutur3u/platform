import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMail } from './mail-loader.mjs';

const secured = (response) =>
  assert.deepEqual(
    [...response.headers].filter(
      ([key]) => key === 'strict-transport-security'
    ),
    [['strict-transport-security', 'max-age=63072000']]
  );
for (const [path, status] of [
  ['/outside', 404],
  ['/mail/api/auth/logout', 409],
  ['/api/build-info', 200],
]) {
  test(`Mail local ${path}`, async () => {
    const worker = await loadMail(new Error('dispatch must not run'));
    const response = await worker.fetch(
      new Request(`https://example.test${path}`),
      {},
      {}
    );
    assert.equal(response.status, status);
    secured(response);
    assert.ok(await response.text());
  });
}
for (const [path, status] of [
  ['/', 200],
  ['/redirect', 302],
  ['/api/local', 401],
  ['/_rum', 202],
  ['/mail/_rum', 429],
]) {
  test(`Mail response preservation ${path}`, async () => {
    const input = new Response('synthetic payload', {
      status,
      headers: [
        ['Strict-Transport-Security', 'max-age=1; preload'],
        ['sTrIcT-TrAnSpOrT-sEcUrItY', 'max-age=2'],
        ['Set-Cookie', 'one=1; Path=/'],
        ['Set-Cookie', 'two=2; Path=/'],
        ['Location', '/destination'],
        ['Access-Control-Allow-Origin', 'https://example.test'],
        ['Cache-Control', 'private, no-store'],
        ['WWW-Authenticate', 'Bearer'],
      ],
    });
    const worker = await loadMail(input);
    const response = await worker.fetch(
      new Request(`https://example.test${path}`),
      {},
      {}
    );
    assert.equal(response.status, status);
    secured(response);
    for (const key of [
      'location',
      'access-control-allow-origin',
      'cache-control',
      'www-authenticate',
    ])
      assert.equal(response.headers.get(key), input.headers.get(key));
    assert.deepEqual(
      response.headers.getSetCookie(),
      input.headers.getSetCookie()
    );
    assert.equal(await response.text(), 'synthetic payload');
  });
}
test('Mail dispatch failure is finalized', async () => {
  const worker = await loadMail(new Error('synthetic startup failure'));
  const response = await worker.fetch(
    new Request('https://example.test/'),
    {},
    {}
  );
  assert.equal(response.status, 500);
  secured(response);
  assert.equal(await response.text(), 'Internal Server Error');
});
