import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertQualifiedHttp,
  httpQualificationReceipt,
  selectHttpRuntime,
} from './employee-http-receipt.mjs';

const complete = {
  qualified: true,
  phase: 'complete',
  assertions: 29,
  productionProof: false,
  routeAuthorizationProof: false,
};
test('HTTP mode cannot run without the full journal schema and remains opt-in', () => {
  assert.equal(selectHttpRuntime(undefined, true), false);
  assert.equal(selectHttpRuntime('false', true), false);
  assert.equal(selectHttpRuntime('true', true), true);
  for (const value of ['true', '1', '', true])
    assert.throws(() => selectHttpRuntime(value, false));
});
test('only complete real assertions qualify transport and no production proof is inferred', () => {
  assert.doesNotThrow(() =>
    assertQualifiedHttp(httpQualificationReceipt(JSON.stringify(complete)))
  );
  for (const value of [
    { ...complete, qualified: false },
    { ...complete, assertions: 28 },
    { ...complete, phase: 'independent-state' },
  ])
    assert.throws(() =>
      assertQualifiedHttp(httpQualificationReceipt(JSON.stringify(value)))
    );
});
test('failed receipt retains a fixed phase without private error payloads', () => {
  const failed = {
    ...complete,
    qualified: false,
    phase: 'lost-provider-acknowledgement',
    assertions: 24,
  };
  assert.deepEqual(
    httpQualificationReceipt(
      JSON.stringify({ ...failed, error: 'private-password-and-response' })
    ),
    failed
  );
});
test('malformed, oversized and overstated proof fails closed', () => {
  for (const value of [
    null,
    [],
    { ...complete, phase: 'private-runtime-message' },
    { ...complete, assertions: 30 },
    { ...complete, assertions: '29' },
    { ...complete, productionProof: true },
    { ...complete, routeAuthorizationProof: true },
  ])
    assert.throws(() => httpQualificationReceipt(JSON.stringify(value)));
  assert.throws(() => httpQualificationReceipt('x'.repeat(4097)));
  assert.throws(() => httpQualificationReceipt('{}\n{}'));
});
