import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

test('emitted ai Worker applies security and personalized cache policy', {
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
            ...(request.url.includes('/external-projects/assets/')
              ? {
                  'Content-Security-Policy':
                    "sandbox allow-scripts; default-src 'none'",
                }
              : {}),
          },
        }
      );
    },
  });
  for (const host of ['ai.tuturuuu.com', 'ai-staging.tuturuuu.com']) {
    for (const path of ['/api/build-info', '/api/private', '/vi']) {
      const response = await worker.request(path, { host });
      if (path === '/api/build-info') assert.equal(response.status, 200);
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
  const publicPath = '/api/cache-policy-fixture.json';
  const publicResponse = await worker.request(publicPath);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers['cache-control'], 'private, no-store');
  assert.match(publicResponse.headers.vary ?? '', /(?:^|,\s*)cookie(?:,|$)/i);
  assert.ok(
    upstream.includes(`https://central.invalid${publicPath}`),
    'Probe must reach the upstream public cache fixture'
  );
  const sandbox = "sandbox allow-scripts; default-src 'none'";
  const webgl =
    '/api/v1/workspaces/fixture/external-projects/assets/fixture/webgl/game.js';
  const sandboxed = await worker.request(webgl);
  assert.equal(sandboxed.status, 200);
  assert.equal(sandboxed.headers['content-security-policy'], sandbox);
  assert.equal(sandboxed.headers['x-frame-options'], undefined);
  assert.ok(upstream.includes(`https://central.invalid${webgl}`));
  const neighbouring = await worker.request(
    webgl.replace('/webgl/', '/webgl-other/')
  );
  assert.equal(neighbouring.status, 200);
  assert.equal(
    neighbouring.headers['content-security-policy'],
    `${sandbox}; frame-ancestors 'none'`
  );
  assert.equal(neighbouring.headers['x-frame-options'], 'DENY');
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
