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

test('checks shared apex metadata resources and mounted CSS', async (t) => {
  const call = fixture(`
    <link rel="icon" href="https://tuturuuu.com/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="shortcut icon" href="https://tuturuuu.com/favicon-16x16.png">
    <link rel="icon" sizes="32x32" href="/favicon-32x32.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.webmanifest">
    <meta property="og:image" content="https://tuturuuu.com/media/logos/og-image.jpg">
    <meta name="twitter:image" content="/media/logos/og-image.jpg">
    <link rel="stylesheet" href="/tools/assets/main.css">
  `);
  const contentTypes = {
    '/favicon.ico': 'image/x-icon',
    '/favicon-16x16.png': 'image/png',
    '/favicon-32x32.png': 'image/png',
    '/apple-touch-icon.png': 'image/png',
    '/manifest.webmanifest': 'application/manifest+json',
    '/media/logos/og-image.jpg': 'image/jpeg',
  };
  const sharedRequests = [];
  await assertRenderedAssets(t, require, call, pages, async (url) => {
    sharedRequests.push(String(url));
    return new Response(null, {
      headers: {
        'content-type': contentTypes[url.pathname],
      },
    });
  });
  assert.deepEqual(sharedRequests, [
    'https://tuturuuu.com/favicon.ico',
    'https://tuturuuu.com/favicon-16x16.png',
    'https://tuturuuu.com/favicon-32x32.png',
    'https://tuturuuu.com/apple-touch-icon.png',
    'https://tuturuuu.com/manifest.webmanifest',
    'https://tuturuuu.com/media/logos/og-image.jpg',
  ]);
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
  for (const [html, message] of [
    [
      '<link rel="modulepreload" href="/assets/main.js">',
      /\/assets\/main\.js outside \/tools/u,
    ],
    [
      '<link rel="mask-icon" href="/mask-icon.svg">',
      /\/mask-icon\.svg outside \/tools/u,
    ],
    [
      '<link rel="manifest" href="/site.webmanifest">',
      /\/site\.webmanifest outside \/tools/u,
    ],
    [
      '<meta property="og:image" content="/preview.jpg">',
      /\/preview\.jpg outside \/tools/u,
    ],
  ]) {
    await assert.rejects(
      assertRenderedAssets(t, require, fixture(html), pages, () => {
        assert.fail('app assets must be checked against the mounted Worker');
      }),
      message
    );
  }
});
