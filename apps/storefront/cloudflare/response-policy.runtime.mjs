import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

test('emitted storefront Worker applies security and personalized cache policy', {
  timeout: 120000,
}, async (t) => {
  const upstream = [];
  const worker = await startFixtureWorker(t, {
    bindings: { INVENTORY_APP_URL: 'https://inventory.invalid' },
    outboundService(request) {
      upstream.push(request.url);
      return Response.json(
        { fixture: true },
        {
          headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
          },
        }
      );
    },
  });
  for (const host of [
    'storefront.tuturuuu.com',
    'store.tuturuuu.com',
    'storefront-staging.tuturuuu.com',
  ]) {
    for (const path of [
      '/',
      '/api/build-info',
      '/api/private',
      '/login',
      '/vi',
    ]) {
      const response = await worker.request(path, { host });
      if (path === '/api/build-info') assert.equal(response.status, 200);
      if (path === '/') {
        assert.equal(response.status, 307);
        assert.equal(
          new URL(response.headers.location, `http://${host}`).pathname,
          '/demo'
        );
      }
      if (path === '/login') {
        assert.equal(response.status, 307);
        const login = new URL(response.headers.location, `http://${host}`);
        assert.equal(login.pathname, '/login');
        const callback = login.searchParams.get('returnUrl');
        assert.ok(callback, 'Login must retain its app callback');
        assert.equal(new URL(callback).hostname, host);
      }
      assert.equal(
        response.headers['content-security-policy'],
        "frame-ancestors 'none'"
      );
      assert.equal(response.headers['x-frame-options'], 'DENY');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(
        response.headers['referrer-policy'],
        'strict-origin-when-cross-origin'
      );
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
      assert.match(
        response.headers['cache-control'] ?? '',
        /(?:^|[, ])no-store(?:$|[, ])/
      );
      assert.match(response.headers.vary ?? '', /(?:^|,\s*)cookie(?:,|$)/i);
    }
  }
  const publicPath = '/api/v1/inventory/storefronts/cache-fixture';
  const publicResponse = await worker.request(publicPath);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers['cache-control'], 'private, no-store');
  assert.match(publicResponse.headers.vary ?? '', /(?:^|,\s*)cookie(?:,|$)/i);
  assert.ok(
    upstream.includes(`https://inventory.invalid${publicPath}`),
    'Probe must reach the upstream public cache fixture'
  );
  for (const path of ['/assets/client.js', '/robots.txt']) {
    for (const method of ['POST', 'PUT']) {
      const response = await worker.request(path, { method });
      assert.equal(
        response.headers['cache-control'],
        'private, no-store',
        `${method} ${path}`
      );
      assert.match(response.headers.vary ?? '', /(?:^|,\s*)cookie(?:,|$)/i);
    }
  }
  for (const host of ['tuturuuu.com', 'www.tuturuuu.com', 'unknown.invalid']) {
    assert.equal(
      (await worker.request('/api/build-info', { host })).status,
      404
    );
  }
});
