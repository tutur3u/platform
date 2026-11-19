import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exerciseStorefrontHost,
  STOREFRONT_ALIAS_HOSTS,
  STOREFRONT_ROOT_HOST,
  storefrontAssetFile,
  storefrontHostKind,
  storefrontRuntimeHosts,
} from './storefront-native-runtime.mjs';

const SHA = 'b'.repeat(40);
const ASSET_FILE = 'assets/index-abc.js';
const ASSET_BYTES = Buffer.from('console.log(1)');

const headers = (extra = {}) => ({
  'x-robots-tag': 'noindex, nofollow',
  'strict-transport-security': 'max-age=63072000',
  'cache-control': 'private, no-store',
  ...extra,
});
const redirect = (location, extra = {}) =>
  new Response(null, { status: 307, headers: headers({ location, ...extra }) });

function canonicalRoutes(host, overrides = {}) {
  const routes = {
    'GET /api/build-info': () =>
      Response.json(
        {
          appName: 'storefront',
          commitHash: SHA,
          environment: 'production',
        },
        { headers: headers() }
      ),
    'HEAD /api/build-info': () => new Response(null, { headers: headers() }),
    'POST /api/build-info': () =>
      new Response('{}', { status: 401, headers: headers() }),
    'GET /': () =>
      redirect('/demo', { 'set-cookie': 'NEXT_LOCALE=en; Path=/' }),
    'GET /orders': () => redirect(`https://${host}/login?next=%2Forders`),
    'GET /login': () =>
      redirect(
        `https://tuturuuu.com/login?returnUrl=${encodeURIComponent(`https://${host}/verify-token?nextUrl=%2Fdemo`)}`
      ),
    [`GET /${ASSET_FILE}`]: () =>
      new Response(ASSET_BYTES, {
        headers: headers({ 'cache-control': 'public, max-age=0' }),
      }),
    'GET /robots.txt': () => new Response('User-agent: *'),
    'GET /assets/__native-smoke-missing__.js': () =>
      new Response('Not Found', { status: 404 }),
    'GET /api/__native-smoke-missing__': () =>
      new Response('{}', { status: 401, headers: headers() }),
    ...overrides,
  };
  return (path, { method = 'GET' } = {}) => {
    const route = routes[`${method} ${path}`];
    assert.ok(route, `unexpected probe ${method} ${path}`);
    return Promise.resolve(route());
  };
}

const exercise = (host, fetchWorker) =>
  exerciseStorefrontHost({
    host,
    fetchWorker,
    sha: SHA,
    environment: 'production',
    assetFile: ASSET_FILE,
    assetBytes: ASSET_BYTES,
  });

test('the runtime hosts put the attached host first and always cover the root', () => {
  const alias = STOREFRONT_ALIAS_HOSTS[0];
  assert.deepEqual(storefrontRuntimeHosts({ host: alias }), [
    alias,
    STOREFRONT_ROOT_HOST,
    'unknown-host.invalid',
  ]);
  assert.deepEqual(storefrontRuntimeHosts({ host: STOREFRONT_ROOT_HOST }), [
    STOREFRONT_ROOT_HOST,
    alias,
    'unknown-host.invalid',
  ]);
  assert.throws(
    () => storefrontRuntimeHosts({ host: 'other.tuturuuu.com' }),
    /publishes only store\.tuturuuu\.com/u
  );
  assert.equal(storefrontHostKind(STOREFRONT_ROOT_HOST), 'canonical');
  assert.equal(storefrontHostKind(alias), 'alias');
  assert.equal(storefrontHostKind('unknown-host.invalid'), 'unknown');
});

test('an alias host answers 307 to the root host for every path and query', async () => {
  const seen = [];
  const lines = await exercise('storefront.tuturuuu.com', (path) => {
    seen.push(path);
    return Promise.resolve(redirect(`https://${STOREFRONT_ROOT_HOST}${path}`));
  });
  assert.deepEqual(seen, [
    '/',
    '/api/build-info',
    '/orders?tag=a&tag=b',
    '/assets/missing.js',
  ]);
  assert.equal(lines.length, 4);
  await assert.rejects(
    exercise('storefront.tuturuuu.com', (path) =>
      Promise.resolve(redirect(`https://evil.example${path}`))
    ),
    /redirect target/u
  );
  await assert.rejects(
    exercise('storefront.tuturuuu.com', () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    ),
    /must redirect/u
  );
  await assert.rejects(
    exercise('storefront.tuturuuu.com', (path) =>
      Promise.resolve(
        new Response(null, {
          status: 307,
          headers: {
            location: `https://${STOREFRONT_ROOT_HOST}${path}`,
            'strict-transport-security': 'max-age=63072000',
          },
        })
      )
    ),
    /noindex/u
  );
});

test('an unknown host is refused before any app content', async () => {
  const fetchWorker = () =>
    Promise.resolve(new Response('Not Found', { status: 404 }));
  assert.equal((await exercise('unknown-host.invalid', fetchWorker)).length, 2);
  await assert.rejects(
    exercise('unknown-host.invalid', () =>
      Promise.resolve(new Response('Not Found', { status: 200 }))
    ),
    /must 404/u
  );
});

test('the root host serves identity, hands signed-out visitors to login and serves assets', async () => {
  const host = STOREFRONT_ROOT_HOST;
  const lines = await exercise(host, canonicalRoutes(host));
  assert.equal(lines.length, 10);
  assert.match(
    lines.join('\n'),
    /GET \/orders -> 307 Location https:\/\/store/u
  );
});

test('the root host fails on a wrong identity, a public orders page or a leaked cookie', async () => {
  const host = STOREFRONT_ROOT_HOST;
  await assert.rejects(
    exercise(
      host,
      canonicalRoutes(host, {
        'GET /api/build-info': () =>
          Response.json(
            {
              appName: 'storefront',
              commitHash: 'c'.repeat(40),
              environment: 'production',
            },
            { headers: headers() }
          ),
      })
    ),
    /source identity differs/u
  );
  await assert.rejects(
    exercise(
      host,
      canonicalRoutes(host, {
        'GET /orders': () => new Response('orders', { headers: headers() }),
      })
    ),
    /Anonymous orders page must redirect/u
  );
  await assert.rejects(
    exercise(
      host,
      canonicalRoutes(host, {
        'GET /': () =>
          redirect('/demo', { 'set-cookie': 'sb-access-token=abc; Path=/' }),
      })
    ),
    /unexpected cookies/u
  );
  await assert.rejects(
    exercise(
      host,
      canonicalRoutes(host, {
        'POST /api/build-info': () =>
          new Response('{}', { status: 200, headers: headers() }),
      })
    ),
    /must not accept mutations/u
  );
});

test('the asset probe names a hashed client script of the sealed receipt', () => {
  assert.equal(
    storefrontAssetFile({
      files: { 'client/robots.txt': 'x', 'client/assets/a-1.js': 'y' },
    }),
    'assets/a-1.js'
  );
  assert.throws(
    () => storefrontAssetFile({ files: { 'client/robots.txt': 'x' } }),
    /asset missing/u
  );
});
