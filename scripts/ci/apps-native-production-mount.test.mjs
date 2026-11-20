import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appsProductionMountHost,
  exerciseAppsProductionMount,
} from './apps-native-production-mount.mjs';
import { releaseRecipes } from './wave1-native-profile.mjs';

const query = '?tag=1&tag=2&q=a%2Fb';
const localeCookie = 'NEXT_LOCALE=en; Path=/; Domain=.tuturuuu.com';
const html =
  '<a href="/apps/drive"></a><a href="/apps/calendar"></a>' +
  '<link href="/apps/assets/catalogue.css">' +
  '<script src="/apps/assets/catalogue.js"></script>';

function fixture(overrides = new Map()) {
  const paths = [];
  const page = () =>
    new Response(html, {
      headers: {
        'cache-control': 'private, no-store',
        'set-cookie': localeCookie,
      },
    });
  const redirect = (location) =>
    new Response(null, {
      status: 307,
      headers: {
        location,
        'cache-control': 'private, no-store',
        'set-cookie': localeCookie,
      },
    });
  const responses = new Map([
    ['/', () => new Response('Not Found', { status: 404 })],
    ['/apps-other', () => new Response('Not Found', { status: 404 })],
    ['/apps/%2F%2Fevil.example', () => new Response(null, { status: 404 })],
    [`/apps${query}`, page],
    [`/apps/${query}`, page],
    ['/apps/assets/catalogue.css', () => new Response('sealed CSS')],
    ['/apps/assets/catalogue.js', () => new Response('sealed JS')],
    [`/apps/en${query}`, () => redirect(`https://tuturuuu.com/apps${query}`)],
    [
      `/apps/drive/a%2Fb${query}`,
      () => redirect(`https://drive.tuturuuu.com/a%2Fb${query}&source=apps`),
    ],
  ]);
  return {
    paths,
    fetch: async (path) => {
      paths.push(path);
      return (overrides.get(path) ?? responses.get(path))();
    },
    readAsset: (name) => {
      assert.match(name, /^client\/assets\/catalogue\.(css|js)$/u);
      return Buffer.from(name.endsWith('.css') ? 'sealed CSS' : 'sealed JS');
    },
  };
}

test('the Apps release recipe and protected smoke admit exactly the apex origin', () => {
  assert.equal(appsProductionMountHost(releaseRecipes.apps), 'tuturuuu.com');
  for (const mountHosts of [
    [],
    ['https://tuturuuu.com:444'],
    ['https://tuturuuu.com', 'https://apps.tuturuuu.com'],
  ]) {
    assert.throws(
      () => appsProductionMountHost({ mountHosts }),
      /approved apex/u
    );
  }
});

test('the protected Apps smoke requests only the expected mount and sibling paths', async () => {
  const runtime = fixture();
  await exerciseAppsProductionMount(runtime.fetch, runtime.readAsset);
  assert.deepEqual(runtime.paths, [
    '/',
    '/apps-other',
    '/apps/%2F%2Fevil.example',
    `/apps${query}`,
    `/apps/${query}`,
    '/apps/assets/catalogue.css',
    '/apps/assets/catalogue.js',
    `/apps/en${query}`,
    `/apps/drive/a%2Fb${query}`,
  ]);
});

test('the protected Apps smoke refuses root asset links and altered asset bytes', async () => {
  for (const [path, response, message] of [
    [
      `/apps${query}`,
      () =>
        new Response(html.replace('/apps/assets/', '/assets/'), {
          headers: {
            'cache-control': 'no-store',
            'set-cookie': localeCookie,
          },
        }),
      /Unprefixed Apps asset/u,
    ],
    [
      '/apps/assets/catalogue.js',
      () => new Response('different JS'),
      /differs from sealed bytes/u,
    ],
  ]) {
    const runtime = fixture(new Map([[path, response]]));
    await assert.rejects(
      exerciseAppsProductionMount(runtime.fetch, runtime.readAsset),
      message
    );
  }
});

test('the protected Apps smoke refuses a launcher redirect that loses query parameters', async () => {
  const runtime = fixture(
    new Map([
      [
        `/apps/drive/a%2Fb${query}`,
        () =>
          new Response(null, {
            status: 307,
            headers: {
              location:
                'https://drive.tuturuuu.com/a%2Fb?tag=2&q=a%2Fb&source=apps',
            },
          }),
      ],
    ])
  );
  await assert.rejects(
    exerciseAppsProductionMount(runtime.fetch, runtime.readAsset),
    /redirect target/u
  );
});

test('the protected Apps smoke rejects extra cookies and an out-of-scope locale cookie', async () => {
  for (const [cookies, reason] of [
    [[localeCookie, 'session=fixture; Path=/'], /only the Apps locale cookie/u],
    [['NEXT_LOCALE=en; Path=/finance'], /path=/iu],
    [['NEXT_LOCALE=en; Path=/apps; Domain=example.test'], /domain=/iu],
  ]) {
    const runtime = fixture(
      new Map([
        [
          `/apps${query}`,
          () => {
            const headers = new Headers({ 'cache-control': 'no-store' });
            for (const cookie of cookies) headers.append('set-cookie', cookie);
            return new Response(html, { headers });
          },
        ],
      ])
    );
    await assert.rejects(
      exerciseAppsProductionMount(runtime.fetch, runtime.readAsset),
      reason
    );
  }
});
