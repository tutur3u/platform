import assert from 'node:assert/strict';
import test from 'node:test';
import { pageRouteModule } from './templates.mjs';

test('page loaders select body serialization for location payloads', () => {
  for (const pageProxyModule of [undefined, '../proxy']) {
    const source = pageRouteModule({
      app: 'demo',
      appBase: true,
      pageProxyModule,
    });
    assert.match(
      source,
      /const loadPage = createServerFn\(\{ method: 'POST' \}\)/u
    );
    assert.doesNotMatch(source, /method: 'GET'/u);
    assert.match(source, /loadPage\(\{ data: href \}\)/u);
    assert.match(source, /serverFnBase: '\/_serverFn'/u);
  }
});
