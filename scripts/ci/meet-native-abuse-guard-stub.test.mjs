import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ABUSE_GUARD_STUB,
  admitAbuseGuardEdge,
  admitAbuseGuardStub,
  createAbuseGuardStub,
  REAL_ABUSE_GUARD,
  STUB_BODY,
  STUB_STATUS,
} from './meet-native-abuse-guard-stub.mjs';
import { appBindings, EDGES, fixtureBindings } from './meet-native-profile.mjs';

const secret = () => randomUUID() + randomUUID();
const services = () => [
  { binding: 'WORKER_SELF_REFERENCE', service: 'tuturuuu-meet' },
  { ...REAL_ABUSE_GUARD },
];
const edge = () =>
  EDGES.find(([role, name]) => role === 'app' && name === 'ABUSE_GUARD');

test('the real guard binding is pinned to its named RPC entrypoint', () => {
  assert.deepEqual(
    { ...REAL_ABUSE_GUARD },
    {
      binding: 'ABUSE_GUARD',
      service: 'tuturuuu-abuse-guard',
      entrypoint: 'AbuseGuardEntrypoint',
    }
  );
  assert.ok(Object.isFrozen(REAL_ABUSE_GUARD));
});

test('the local stub answers every request fail-closed and bounds calls', async () => {
  const stub = createAbuseGuardStub();
  const response = await stub.binding.fetcher(
    new Request('https://abuse-guard.invalid/v1/rpc', {
      method: 'POST',
      body: '{}',
    })
  );
  assert.equal(response.status, STUB_STATUS);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), STUB_BODY);
  assert.deepEqual(stub.calls, [{ method: 'POST', path: '/v1/rpc' }]);
  for (let i = 1; i < 32; i++)
    await stub.binding.fetcher(new Request('https://abuse-guard.invalid/'));
  await assert.rejects(
    stub.binding.fetcher(new Request('https://abuse-guard.invalid/')),
    /call bound/
  );
});

test('the stub is in-process and exposes no service or RPC surface', () => {
  const { binding } = createAbuseGuardStub();
  assert.ok(Object.isFrozen(binding));
  assert.deepEqual(Object.keys(binding).sort(), ['fetcher', 'type']);
  assert.equal(binding.type, 'fetcher');
  assert.equal('service' in binding, false);
  assert.equal('entrypoint' in binding, false);
  assert.equal('run' in binding, false);
  assert.equal(admitAbuseGuardStub(binding), binding);
});

test('the stub can never be the real guard or a lookalike', () => {
  const { binding } = createAbuseGuardStub();
  for (const candidate of [
    { type: 'service', ...REAL_ABUSE_GUARD },
    { type: 'service', service: 'tuturuuu-abuse-guard' },
    { type: 'service', service: 'meet-ci-binding-probe' },
    { type: 'fetcher', fetcher: binding.fetcher },
    { ...binding },
    { ...binding, service: REAL_ABUSE_GUARD.service },
    Object.freeze({ type: 'fetcher', fetcher: async () => new Response() }),
    undefined,
    null,
  ])
    assert.throws(
      () => admitAbuseGuardStub(candidate),
      /Abuse-guard binding must be the local stub/
    );
});

test('app bindings are the fixture values plus exactly the local stub', () => {
  const value = secret();
  const { binding } = createAbuseGuardStub();
  const bindings = appBindings(value, binding);
  assert.deepEqual(Object.keys(bindings).sort(), [
    'ABUSE_GUARD',
    ...Object.keys(fixtureBindings(value)).sort(),
  ]);
  assert.equal(bindings.ABUSE_GUARD, binding);
  assert.throws(() =>
    appBindings(value, { type: 'service', ...REAL_ABUSE_GUARD })
  );
  assert.throws(() => appBindings(value, undefined));
});

test('the ABUSE_GUARD edge is required exactly and only as a local stub', () => {
  assert.deepEqual(edge(), [
    'app',
    'ABUSE_GUARD',
    'stub-service',
    ABUSE_GUARD_STUB,
  ]);
  assert.equal(EDGES.filter(([, , kind]) => kind === 'stub-service').length, 1);
  for (const item of EDGES.flat())
    assert.ok(
      item !== REAL_ABUSE_GUARD.service && item !== REAL_ABUSE_GUARD.entrypoint,
      'No qualification edge may reach the real guard'
    );
  admitAbuseGuardEdge(services(), edge());
  for (const wrong of [
    undefined,
    ['app', 'ABUSE_GUARD', 'service', 'tuturuuu-abuse-guard'],
    ['app', 'ABUSE_GUARD', 'stub-service', 'tuturuuu-abuse-guard'],
    ['app', 'ABUSE_GUARD', 'stub-service', 'AbuseGuardEntrypoint'],
    ['app', 'ABUSE_GUARD', 'service', ABUSE_GUARD_STUB],
    ['probe', 'ABUSE_GUARD', 'stub-service', ABUSE_GUARD_STUB],
  ])
    assert.throws(() => admitAbuseGuardEdge(services(), wrong));
});

test('a wrong, missing or duplicated guard service is rejected', () => {
  for (const mutate of [
    (s) => s.splice(1, 1),
    (s) => {
      s[1].service = 'tuturuuu-abuse-guard-staging';
    },
    (s) => {
      s[1].entrypoint = 'default';
    },
    (s) => {
      delete s[1].entrypoint;
    },
    (s) => {
      s[1].remote = true;
    },
    (s) => s.push({ ...REAL_ABUSE_GUARD }),
  ]) {
    const value = services();
    mutate(value);
    assert.throws(() => admitAbuseGuardEdge(value, edge()));
  }
});
