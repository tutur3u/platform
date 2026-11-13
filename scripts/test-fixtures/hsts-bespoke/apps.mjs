import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWorker } from './apps-loader.mjs';

const request = () => new Request('https://apps.tuturuuu.com/api/fixture');
test('Apps canonical host refusal is secured before dispatch', async () => {
  const worker = await loadWorker('apps', new Error('must not dispatch'));
  const response = await worker.fetch(request(), {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), 'Staging gateway only');
  assert.equal(
    response.headers.get('strict-transport-security'),
    'max-age=63072000'
  );
});
for (const status of [200, 302, 404, 500]) {
  test(`Apps outer policy preserves ${status} after custom cookie wrapper`, async () => {
    const input = new Response('fixture', {
      status,
      headers: [
        ['Strict-Transport-Security', 'max-age=1; preload'],
        ['sTrIcT-TrAnSpOrT-sEcUrItY', 'max-age=2'],
        ['Set-Cookie', 'one=1; Path=/'],
        ['Set-Cookie', 'two=2; Path=/'],
        ['Location', '/destination'],
        ['Content-Security-Policy', "default-src 'self'"],
        ['Cache-Control', 'private, no-store'],
      ],
    });
    const worker = await loadWorker('apps', input);
    const response = await worker.fetch(request(), {
      APPS_CANONICAL_HOST_ENABLED: '1',
    });
    assert.equal(response.status, status);
    assert.deepEqual(
      [...response.headers].filter(
        ([key]) => key === 'strict-transport-security'
      ),
      [['strict-transport-security', 'max-age=63072000']]
    );
    for (const key of ['location', 'content-security-policy', 'cache-control'])
      assert.equal(response.headers.get(key), input.headers.get(key));
    assert.deepEqual(
      response.headers.getSetCookie(),
      input.headers.getSetCookie()
    );
    assert.equal(await response.text(), 'fixture');
  });
}
test('Apps dispatch exception returns secured 500', async () => {
  const worker = await loadWorker(
    'apps',
    new Error('fixture dispatch failure')
  );
  const response = await worker.fetch(request(), {
    APPS_CANONICAL_HOST_ENABLED: '1',
  });
  assert.equal(response.status, 500);
  assert.equal(
    response.headers.get('strict-transport-security'),
    'max-age=63072000'
  );
});
