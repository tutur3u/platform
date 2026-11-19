import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { assertRenderedAssets } from './html-asset-acceptance.mjs';

const require = createRequire(
  new URL('../../apps/tools/package.json', import.meta.url)
);
const host = 'tuturuuu.com';
const pages = [{ host, path: '/tools', base: '/tools' }];

const fixture = (html) => async (path, originHost) => {
  assert.equal(originHost, host);
  if (path === '/tools') {
    return {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: html,
    };
  }
  assert.equal(path, '/tools/assets/main.css');
  return { status: 200, headers: { 'content-type': 'text/css' } };
};

test('accepts the shared apex favicon and still resolves mounted CSS', async (t) => {
  const call = fixture(`
    <link rel="icon" href="https://tuturuuu.com/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="stylesheet" href="/tools/assets/main.css">
  `);
  const sharedRequests = [];
  await assertRenderedAssets(t, require, call, pages, async (url) => {
    sharedRequests.push(String(url));
    return new Response(null, { headers: { 'content-type': 'image/x-icon' } });
  });
  assert.deepEqual(sharedRequests, ['https://tuturuuu.com/favicon.ico']);
});

test('requires the shared favicon response to be an image', async (t) => {
  const call = fixture('<link rel="icon" href="/favicon.ico">');
  await assert.rejects(
    assertRenderedAssets(
      t,
      require,
      call,
      pages,
      async () =>
        new Response('login', {
          headers: { 'content-type': 'text/html' },
        })
    ),
    /https:\/\/tuturuuu\.com\/favicon\.ico/u
  );
});

test('rejects an app asset emitted outside its mount', async (t) => {
  const call = fixture('<link rel="modulepreload" href="/assets/main.js">');
  await assert.rejects(
    assertRenderedAssets(t, require, call, pages, () => {
      assert.fail('app assets must be checked against the mounted Worker');
    }),
    /emitted \/assets\/main\.js outside \/tools/u
  );
});
