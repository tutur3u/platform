import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

const subject = 'c862b651-3e9d-4e93-b365-af745cf5d381';
const key = 'a'.repeat(64);

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
    subject,
    signal,
    async (url, init) => {
      forwarded.push({ url, init });
      return new Response(null, {
        status: 302,
        headers: { location: 'https://unadmitted.invalid/' },
      });
    },
    'app',
    key
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
  const app = fixtureEgress(
    'http://127.0.0.1:12345',
    subject,
    undefined,
    undefined,
    'app',
    key
  );
  const negative = fixtureEgress(
    'http://127.0.0.1:12345',
    subject,
    undefined,
    undefined,
    'negative',
    key
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
    subject,
    undefined,
    async () => new Response('bad'),
    'app',
    key
  );
  assert.throws(() =>
    admitAppsPolicies('http', { app: passthrough, negative })
  );
  assert.throws(() => admitAppsPolicies('other', {}));
  assert.throws(() =>
    fixtureEgress(
      'http://127.0.0.1:12345',
      subject,
      undefined,
      undefined,
      'probe',
      key
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
    subject,
    undefined,
    async (...args) => {
      forwarded.push(args);
      return new Response('ok');
    },
    'app',
    key
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
  const bounded = fixtureEgress(
    'http://127.0.0.1:12345',
    subject,
    undefined,
    undefined,
    'app',
    key
  );
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

test('known-subject account assurance stays separate from the original API denial counter', async () => {
  const origin = 'http://127.0.0.1:12345';
  const subject = 'c862b651-3e9d-4e93-b365-af745cf5d381';
  const key = 'a'.repeat(64);
  const forwarded = [];
  const fence = fixtureEgress(
    origin,
    subject,
    undefined,
    async (url, init) => {
      forwarded.push({ url, init });
      return Response.json({ id: subject });
    },
    'negative',
    key
  );
  const response = await fence.outboundService(
    new Request(`${origin}/auth/v1/admin/users/${subject}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(fence.permitted, []);
  assert.equal(fence.assurance.length, 1);
  assert.equal(forwarded.length, 1);
  const denied = await fence.outboundService(
    new Request('https://apps-unadmitted.invalid/api/v1/users/me/profile')
  );
  assert.equal(denied.status, 599);
  assert.equal(await denied.text(), 'Fixture egress denied');
  assert.deepEqual(fence.unexpected, [
    {
      method: 'GET',
      url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
    },
  ]);
  assert.deepEqual(fence.permitted, []);
});

test('assurance admission rejects every contract variation without forwarding or fallback', async () => {
  const origin = 'http://127.0.0.1:12345';
  const url = `${origin}/auth/v1/admin/users/${subject}`;
  const goodHeaders = { apikey: key, authorization: `Bearer ${key}` };
  const variations = [
    { url: `${url}?anything=1` },
    { url: `${url}#fragment` },
    { url: `${url}/` },
    { url: `${url}suffix` },
    { url: url.replace(subject, 'b'.repeat(36)) },
    { url: url.replace(subject, `%63${subject.slice(1)}`) },
    { url: url.replace('/admin/', '/admin/prefix/') },
    { url: url.replace('http:', 'https:') },
    { url: url.replace(':12345', ':12346') },
    { url: url.replace('127.0.0.1', '127.0.0.1.evil.invalid') },
    { url: url.replace('127.0.0.1', '10.0.0.1') },
    { url: url.replace('http://', 'http://user:password@') },
    { method: 'POST' },
    { method: 'HEAD' },
    { method: 'PATCH' },
    { headers: { authorization: goodHeaders.authorization } },
    { headers: { apikey: key } },
    { headers: { ...goodHeaders, apikey: 'b'.repeat(64) } },
    { headers: { ...goodHeaders, authorization: 'Bearer wrong' } },
    { headers: { ...goodHeaders, cookie: '' } },
    { body: Buffer.from('body') },
  ];
  for (const variation of variations) {
    let forwards = 0;
    const policy = fixtureEgress(
      origin,
      subject,
      undefined,
      async () => {
        forwards++;
        return new Response('must not forward');
      },
      'app',
      key
    );
    // A double can retain credentials, fragments and a GET body that Request rejects or normalizes.
    const request = {
      method: 'GET',
      url,
      body: null,
      ...variation,
      headers: new Headers(variation.headers ?? goodHeaders),
    };
    const denied = await policy.outboundService(request);
    assert.equal(denied.status, 599);
    assert.equal(await denied.text(), 'Fixture egress denied');
    assert.equal(forwards, 0);
    assert.deepEqual(policy.assurance, []);
    assert.deepEqual(policy.permitted, []);
    assert.equal(policy.unexpected.length, 1);
  }
});

test('assurance ceilings are role-specific and share the existing total operation ceiling', async () => {
  const origin = 'http://127.0.0.1:12345';
  const request = () =>
    new Request(`${origin}/auth/v1/admin/users/${subject}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
  for (const [role, limit] of [
    ['app', 4],
    ['negative', 1],
  ]) {
    const forwarded = [];
    const signal = new AbortController().signal;
    const policy = fixtureEgress(
      origin,
      subject,
      signal,
      async (url, init) => {
        forwarded.push({ url, init });
        return new Response(null, {
          status: 302,
          headers: { location: 'https://unadmitted.invalid' },
        });
      },
      role,
      key
    );
    for (let i = 0; i < limit; i++)
      assert.equal((await policy.outboundService(request())).status, 302);
    assert.equal(policy.assurance.length, limit);
    assert.throws(() => policy.assurance.pop(), TypeError);
    assert.deepEqual(policy.permitted, []);
    assert.equal((await policy.outboundService(request())).status, 599);
    assert.equal(policy.assurance.length, limit);
    assert.equal(forwarded.length, limit);
    assert.equal(forwarded[0].init.redirect, 'manual');
    assert.equal(forwarded[0].init.signal, signal);
    assert.equal(policy.unexpected.length, 1);
    // The denied excess read also consumes the unchanged global ceiling.
    for (let i = limit + 1; i < 32; i++)
      assert.equal(
        (
          await policy.outboundService(
            new Request('https://unadmitted.invalid/')
          )
        ).status,
        599
      );
    await assert.rejects(policy.outboundService(request()), /operation budget/);
    assert.equal(forwarded.length, limit);
  }
});

test('closed constructor inputs and pre-start controls cannot widen assurance', async () => {
  const { browserEgress, controlAppsPolicies, appsPolicyReceipt } =
    await import('./native-runtime-fence.mjs');
  const origin = 'http://127.0.0.1:12345';
  for (const invalid of [
    undefined,
    '',
    'fixture-service-key',
    'A'.repeat(64),
    'a'.repeat(63),
    {},
    ['a'.repeat(64)],
  ])
    assert.throws(() =>
      fixtureEgress(origin, subject, undefined, undefined, 'app', invalid)
    );
  for (const invalid of ['', 'not-a-uuid', `${subject}/other`])
    assert.throws(() =>
      fixtureEgress(origin, invalid, undefined, undefined, 'app', key)
    );
  const app = fixtureEgress(origin, subject, undefined, undefined, 'app', key);
  const negative = fixtureEgress(
    origin,
    subject,
    undefined,
    undefined,
    'negative',
    key
  );
  const values = { app, negative };
  const controls = await controlAppsPolicies('http', values);
  assert.deepEqual(app.assurance, []);
  assert.deepEqual(negative.assurance, []);
  assert.deepEqual(appsPolicyReceipt('http', values, controls), {
    app: { controls: 2, permitted: 0, assurance: 0, unexpected: [] },
    negative: { controls: 2, permitted: 0, assurance: 0, unexpected: [] },
  });
  const browser = browserEgress();
  const denied = await browser.outboundService(
    new Request(`${origin}/auth/v1/admin/users/${subject}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
  );
  assert.equal(denied.status, 599);
  assert.deepEqual(browser.assurance, []);
  assert.deepEqual(browser.permitted, []);
});

test('each role compares both credentials to its actual captured generated key', async () => {
  const origin = 'http://127.0.0.1:12345';
  for (const role of ['app', 'negative']) {
    const input = { key: randomBytes(32).toString('hex') };
    const captured = input.key;
    let forwarded = 0;
    const policy = fixtureEgress(
      origin,
      subject,
      undefined,
      async () => {
        forwarded++;
        return new Response('known account');
      },
      role,
      input.key
    );
    input.key = randomBytes(32).toString('hex');
    assert.notEqual(input.key, captured);
    for (const [apikey, bearer] of [
      [captured, input.key],
      [input.key, captured],
      [input.key, input.key],
    ]) {
      const denied = await policy.outboundService(
        new Request(`${origin}/auth/v1/admin/users/${subject}`, {
          headers: { apikey, authorization: `Bearer ${bearer}` },
        })
      );
      assert.equal(denied.status, 599);
    }
    assert.equal(forwarded, 0);
    assert.deepEqual(policy.assurance, []);
    const allowed = await policy.outboundService(
      new Request(`${origin}/auth/v1/admin/users/${subject}`, {
        headers: { apikey: captured, authorization: `Bearer ${captured}` },
      })
    );
    assert.equal(allowed.status, 200);
    assert.equal(forwarded, 1);
    assert.equal(policy.assurance.length, 1);
    assert.deepEqual(policy.permitted, []);
    assert.equal(policy.unexpected.length, 3);
  }
});
