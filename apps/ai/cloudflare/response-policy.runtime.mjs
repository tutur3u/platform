import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

test('emitted ai Worker applies security and personalized cache policy', {
  timeout: 120000,
}, async (t) => {
  const worker = await startFixtureWorker(t);
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
  for (const host of ['tuturuuu.com', 'www.tuturuuu.com', 'unknown.invalid']) {
    assert.equal(
      (await worker.request('/api/build-info', { host })).status,
      404
    );
  }
});
