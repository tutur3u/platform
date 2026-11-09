import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixtureWorkspaceId,
  signedSsrFixtureResponse,
} from './signed-ssr-fixture.mjs';

const path = '/rest/v1/workspace_secrets';
const financeOrigin = 'https://finance.tuturuuu.com';
function query() {
  return new URLSearchParams({
    select: '*',
    ws_id: `eq.${fixtureWorkspaceId}`,
    order: 'created_at.desc',
  });
}
function request({
  origin = 'https://finance-fixture.invalid',
  method = 'GET',
  params = query(),
  authorized = true,
  single = false,
  pathname = path,
} = {}) {
  const url = new URL(pathname, origin);
  url.search = params.toString();
  return new Request(url, {
    method,
    headers: {
      ...(authorized
        ? { authorization: 'Bearer synthetic-finance-fixture' }
        : {}),
      ...(single ? { accept: 'application/vnd.pgrst.object+json' } : {}),
    },
  });
}
for (const origin of [
  'https://finance-fixture.invalid',
  'https://finance-ci.supabase.invalid',
]) {
  test(`models empty workspace secrets only on the synthetic origin ${origin}`, async () => {
    const calls = [];
    const response = signedSsrFixtureResponse(
      request({ origin }),
      calls,
      financeOrigin
    );
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
    assert.deepEqual(calls, [path]);
  });
}
test('caps the expected two locale reads without hiding a third request', async () => {
  const calls = [];
  for (let read = 0; read < 2; read++) {
    const response = signedSsrFixtureResponse(request(), calls, financeOrigin);
    assert.ok(response instanceof Response);
    assert.deepEqual(await response.json(), []);
  }
  assert.equal(signedSsrFixtureResponse(request(), calls, financeOrigin), null);
  assert.deepEqual(calls, [path, path]);
});
for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`does not model workspace-secret method ${method}`, () => {
    const calls = [];
    assert.equal(
      signedSsrFixtureResponse(request({ method }), calls, financeOrigin),
      null
    );
    assert.deepEqual(calls, []);
  });
}
for (const [label, mutate] of [
  ['an unfiltered read', (params) => params.delete('ws_id')],
  [
    'another workspace',
    (params) => params.set('ws_id', 'eq.foreign-workspace'),
  ],
  ['another projection', (params) => params.set('select', 'name,value')],
  ['another order', (params) => params.set('order', 'created_at.asc')],
  ['an extra filter', (params) => params.set('name', 'eq.ENABLE_FEE_LOCK')],
  [
    'duplicate filters',
    (params) => params.append('ws_id', `eq.${fixtureWorkspaceId}`),
  ],
]) {
  test(`leaves ${label} unadmitted`, () => {
    const params = query();
    mutate(params);
    const calls = [];
    assert.equal(
      signedSsrFixtureResponse(request({ params }), calls, financeOrigin),
      null
    );
    assert.deepEqual(calls, []);
  });
}
for (const [label, options] of [
  ['an unlisted host', { origin: 'https://other.invalid' }],
  ['a missing credential header', { authorized: false }],
  ['a singular-row response', { single: true }],
  ['a neighbouring path', { pathname: `${path}-extra` }],
]) {
  test(`does not model ${label}`, () => {
    const calls = [];
    assert.equal(
      signedSsrFixtureResponse(request(options), calls, financeOrigin),
      null
    );
    assert.deepEqual(calls, []);
  });
}
