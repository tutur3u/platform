import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoRuntimeResources,
  fixtureEgress,
} from './native-runtime-fence.mjs';

test('owning emitter empty Durable Object binding object is admitted exactly', () => {
  const config = {
    durable_objects: { bindings: [] },
    d1_databases: [],
    kv_namespaces: [],
    r2_buckets: [],
    services: [],
    workflows: [],
  };
  assert.doesNotThrow(() => assertNoRuntimeResources(config));
  for (const value of [
    undefined,
    null,
    [],
    {},
    { bindings: [], unknown: [] },
    { bindings: [{ name: 'NEW', class_name: 'New' }] },
  ]) {
    assert.throws(() =>
      assertNoRuntimeResources({ ...config, durable_objects: value })
    );
  }
  for (const key of [
    'd1_databases',
    'kv_namespaces',
    'r2_buckets',
    'services',
    'workflows',
    'routes',
  ]) {
    for (const value of [null, false, {}, { bindings: [] }, ['new']]) {
      assert.throws(() =>
        assertNoRuntimeResources({ ...config, [key]: value })
      );
    }
  }
});

test('fence forwards only disposable fixture contracts and never follows redirects', async () => {
  const forwarded = [];
  const signal = new AbortController().signal;
  const fence = fixtureEgress(
    'http://127.0.0.1:12345',
    'user',
    signal,
    async (url, init) => {
      forwarded.push({ url, init });
      return new Response(null, {
        status: 302,
        headers: { location: 'https://unadmitted.invalid/' },
      });
    }
  );
  const request = new Request(
    'http://127.0.0.1:12345/api/v1/workspaces/other?tag=1&tag=2',
    {
      method: 'PATCH',
      body: '{"title":"exact"}',
      headers: { cookie: 'disposable=1' },
    }
  );
  assert.equal((await fence.outboundService(request)).status, 302);
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].url, request.url);
  assert.equal(forwarded[0].init.method, 'PATCH');
  assert.equal(
    Buffer.from(forwarded[0].init.body).toString(),
    '{"title":"exact"}'
  );
  assert.equal(
    new Headers(forwarded[0].init.headers).get('cookie'),
    'disposable=1'
  );
  assert.equal(forwarded[0].init.redirect, 'manual');
  assert.equal(forwarded[0].init.signal, signal);
  assert.equal(fence.permitted.length, 1);
  assert.deepEqual(fence.unexpected, []);
  for (const url of [
    'https://unadmitted.invalid/auth/v1/user',
    'http://127.0.0.1:12346/auth/v1/user',
    'http://127.0.0.1:12345/unregistered',
  ]) {
    const response = await fence.outboundService(new Request(url));
    assert.equal(response.status, 599);
    assert.equal(await response.text(), 'Fixture egress denied');
  }
  assert.equal(forwarded.length, 1);
  assert.equal(fence.unexpected.length, 3);
});
