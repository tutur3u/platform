import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterProducts, isSnapshotStale, snapshot } from './roadmap-data.ts';

const publicProducts = ['ai', 'calendar', 'chat', 'contacts', 'drive', 'finance', 'forms', 'hive', 'inventory', 'mail', 'meet', 'storefront', 'tasks', 'track'];

test('snapshot contains only the public product allowlist, without duplicates', () => {
  assert.deepEqual(snapshot.apps.map((app) => app.id).sort(), publicProducts);
  assert.equal(new Set(snapshot.apps.map((app) => app.id)).size, snapshot.apps.length);
});
test('every evidence link is immutable public repository source', () => {
  for (const app of snapshot.apps) {
    assert.ok(app.evidence.length > 0);
    for (const evidence of app.evidence) {
      const url = new URL(evidence.url);
      assert.equal(url.origin, 'https://github.com');
      assert.ok(url.pathname.startsWith(`/tutur3u/platform/blob/${snapshot.sourceCommit}/`));
    }
  }
});
test('every product has its own public product page and bilingual summary', () => {
  for (const app of snapshot.apps) {
    assert.ok(app.productUrl.startsWith('https://tuturuuu.com/products/'));
    assert.ok(app.summary.en.length > 0 && app.summary.vi.length > 0);
    assert.equal(app.checkedAt, snapshot.checkedAt);
  }
});
test('source and publication permission never imply deployed', () => {
  assert.equal(filterProducts(snapshot.apps, '', 'deployed').length, 0);
  for (const id of ['calendar', 'meet']) {
    assert.equal(snapshot.apps.find((app) => app.id === id)?.status, 'active');
  }
});
test('search and status filters combine and normalize whitespace and case', () => {
  assert.deepEqual(filterProducts(snapshot.apps, ' MAIL ', 'blocked').map((app) => app.id), ['mail']);
  assert.equal(filterProducts(snapshot.apps, ' MAIL ', 'active').length, 0);
  assert.equal(filterProducts(snapshot.apps, 'no such product', 'all').length, 0);
  assert.equal(filterProducts(snapshot.apps, '', 'all').length, publicProducts.length);
});
test('freshness becomes stale only after the 24-hour boundary', () => {
  const checked = '2026-11-07T00:00:00Z';
  assert.equal(isSnapshotStale(checked, Date.parse(checked) + 86_400_000), false);
  assert.equal(isSnapshotStale(checked, Date.parse(checked) + 86_400_001), true);
});
