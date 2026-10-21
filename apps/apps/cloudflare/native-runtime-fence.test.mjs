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

test('closed role policies reject substitutions and injected forwarding handlers', async () => {
  const { admitAppsPolicies, browserEgress, controlAppsPolicies } =
    await import('./native-runtime-fence.mjs');
  const app = fixtureEgress('http://127.0.0.1:12345', 'user');
  const negative = fixtureEgress(
    'http://127.0.0.1:12345',
    'user',
    undefined,
    undefined,
    'negative'
  );
  assert.deepEqual(admitAppsPolicies('http', { app, negative }), [
    'app',
    'negative',
  ]);
  for (const value of [
    { app },
    { app, negative, other: app },
    { app: negative, negative: app },
    { app, negative: app },
    { app: { ...app }, negative },
    { app: browserEgress(), negative },
  ]) {
    assert.throws(() => admitAppsPolicies('http', value));
  }
  const passthrough = fixtureEgress(
    'http://127.0.0.1:12345',
    'user',
    undefined,
    async () => new Response('bad')
  );
  assert.throws(() =>
    admitAppsPolicies('http', { app: passthrough, negative })
  );
  assert.throws(() => admitAppsPolicies('other', {}));
  assert.throws(() =>
    fixtureEgress(
      'http://127.0.0.1:12345',
      'user',
      undefined,
      undefined,
      'probe'
    )
  );
  assert.deepEqual(await controlAppsPolicies('http', { app, negative }), {
    app: 2,
    negative: 2,
  });
  assert.deepEqual(app.unexpected, []);
  assert.deepEqual(negative.permitted, []);
  const browser = browserEgress();
  assert.deepEqual(await controlAppsPolicies('browser', { app: browser }), {
    app: 2,
  });
  for (const url of [
    'https://public.invalid/',
    'http://10.0.0.1/',
    'http://127.0.0.1:12345/auth/v1/user',
  ]) {
    const denied = await browser.outboundService(new Request(url));
    assert.equal(denied.status, 599);
    assert.equal(await denied.text(), 'Unexpected disposable-fixture egress');
  }
  assert.deepEqual(browser.permitted, []);
});

test('HTTP policy rejects lookalikes, credentials, wrong methods/query and bounded overflow', async () => {
  const { APPS_FIXTURE_MAX_OPERATIONS, APPS_FIXTURE_MAX_BODY } = await import(
    './native-runtime-fence.mjs'
  );
  const forwarded = [];
  const fence = fixtureEgress(
    'http://127.0.0.1:12345',
    'user',
    undefined,
    async (...args) => {
      forwarded.push(args);
      return new Response('ok');
    }
  );
  for (const [url, method] of [
    ['http://127.0.0.1.evil.invalid:12345/auth/v1/user', 'GET'],
    ['http://user:pass@127.0.0.1:12345/auth/v1/user', 'GET'],
    ['http://10.0.0.1:12345/auth/v1/user', 'GET'],
    ['https://127.0.0.1:12345/auth/v1/user', 'GET'],
    ['http://127.0.0.1:12345/auth/v1/user', 'POST'],
    ['http://127.0.0.1:12345/api/v1/workspaces/other?tag=2&tag=1', 'PATCH'],
  ]) {
    // A plain request double is needed to represent credential URLs: WHATWG
    // Request itself rejects credentials before the policy can inspect them.
    assert.equal((await fence.outboundService({ url, method })).status, 599);
  }
  assert.deepEqual(forwarded, []);
  const oversized = new Request(
    'http://127.0.0.1:12345/api/v1/workspaces/other?tag=1&tag=2',
    { method: 'PATCH', body: 'x'.repeat(APPS_FIXTURE_MAX_BODY + 1) }
  );
  await assert.rejects(fence.outboundService(oversized), /body budget/);
  assert.deepEqual(forwarded, []);
  const bounded = fixtureEgress('http://127.0.0.1:12345', 'user');
  for (let i = 0; i < APPS_FIXTURE_MAX_OPERATIONS; i++)
    assert.equal(
      (
        await bounded.outboundService(
          new Request('https://unadmitted.invalid/')
        )
      ).status,
      599
    );
  await assert.rejects(
    bounded.outboundService(new Request('https://unadmitted.invalid/')),
    /operation budget/
  );
});
