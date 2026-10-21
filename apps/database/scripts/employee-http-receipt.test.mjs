import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertQualifiedHttp,
  httpQualificationReceipt,
  selectHttpRuntime,
} from './employee-http-receipt.mjs';

const complete = {
  qualified: true,
  phase: 'complete',
  assertions: 30,
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
    assertQualifiedHttp(httpQualificationReceipt(JSON.stringify(complete)), 0)
  );
  for (const value of [
    { ...complete, qualified: false },
    { ...complete, assertions: 28 },
    { ...complete, phase: 'independent-state' },
  ])
    assert.throws(() =>
      assertQualifiedHttp(httpQualificationReceipt(JSON.stringify(value)), 0)
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
    { ...complete, assertions: 31 },
    { ...complete, assertions: '29' },
    { ...complete, productionProof: true },
    { ...complete, routeAuthorizationProof: true },
  ])
    assert.throws(() => httpQualificationReceipt(JSON.stringify(value)));
  assert.throws(() => httpQualificationReceipt('x'.repeat(4097)));
  assert.throws(() => httpQualificationReceipt('{}\n{}'));
});

test('a real nonzero child exit cannot qualify from a successful-looking receipt', () => {
  for (const code of [0, 1]) {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        'process.stdout.write(process.argv[1]); process.exit(Number(process.argv[2]));',
        JSON.stringify(complete),
        String(code),
      ],
      { encoding: 'utf8' }
    );
    const receipt = httpQualificationReceipt(result.stdout);
    if (code === 0)
      assert.doesNotThrow(() => assertQualifiedHttp(receipt, result.status));
    else assert.throws(() => assertQualifiedHttp(receipt, result.status));
  }
  for (const status of [undefined, null, -1, '0'])
    assert.throws(() => assertQualifiedHttp(complete, status));
});
test('invalid JSON exposes a fixed error without private parser excerpts', () => {
  assert.throws(
    () => httpQualificationReceipt('private-sensitive-output'),
    (error) =>
      error instanceof Error &&
      !(error instanceof SyntaxError) &&
      error.message === 'HTTP qualification receipt shape invalid'
  );
});

test('RESTORE selection requires the existing HTTP lane and remains opt-in', async () => {
  const { selectRestoreRuntime } = await import('./employee-http-receipt.mjs');
  assert.equal(selectRestoreRuntime(undefined, true), false);
  assert.equal(selectRestoreRuntime('false', true), false);
  assert.equal(selectRestoreRuntime('true', true), true);
  for (const value of ['true', '1', '', true])
    assert.throws(() => selectRestoreRuntime(value, false));
});
test('RESTORE requires every fixed phase count and retains no private fields', async () => {
  const { restorePhaseCounts } = await import('./employee-http-receipt.mjs');
  const restore = {
    qualified: true,
    phase: 'complete',
    assertions: 66,
    phaseAssertions: { ...restorePhaseCounts },
  };
  const qualified = { ...complete, restoreQualification: restore };
  const parse = (value) => httpQualificationReceipt(JSON.stringify(value));
  assert.doesNotThrow(() => assertQualifiedHttp(parse(qualified), 0, true));
  assert.throws(() => assertQualifiedHttp(parse(complete), 0, true));
  assert.throws(() => assertQualifiedHttp(parse(qualified), 1, true));
  assert.deepEqual(
    parse({
      ...qualified,
      restoreQualification: {
        ...restore,
        error: 'private-Auth-response',
      },
    }),
    qualified
  );
  for (const changed of [
    { ...restore, qualified: false },
    { ...restore, phase: 'restore-revoked-actor' },
    {
      ...restore,
      assertions: 65,
      phaseAssertions: {
        ...restorePhaseCounts,
        'restore-revoked-actor': 4,
      },
    },
    {
      ...restore,
      phaseAssertions: {
        ...restorePhaseCounts,
        'restore-revoked-actor': 4,
        'restore-success-and-replay': 12,
      },
    },
    {
      ...restore,
      phaseAssertions: { ...restorePhaseCounts, 'private-value': 1 },
    },
    { ...restore, phase: 'private-error' },
    { ...restore, assertions: 67 },
    { ...restore, phaseAssertions: [] },
  ])
    assert.throws(() =>
      assertQualifiedHttp(
        parse({ ...complete, restoreQualification: changed }),
        0,
        true
      )
    );
});
test('failed RESTORE evidence retains bounded phase counts without qualifying', () => {
  const value = {
    ...complete,
    qualified: false,
    phase: 'restore-runtime',
    restoreQualification: {
      qualified: false,
      phase: 'restore-effective-permissions',
      assertions: 2,
      phaseAssertions: { 'restore-effective-permissions': 2 },
    },
  };
  assert.deepEqual(httpQualificationReceipt(JSON.stringify(value)), value);
  assert.throws(() => assertQualifiedHttp(value, 1, true));
});
