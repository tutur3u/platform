import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimSqlFailure,
  qualifyParallelClaims,
} from './fixtures/employee-address-migration/claim-qualification.mjs';

const envelope = (
  code = '55P03',
  message = 'Address migration admission busy',
  context = 'private.employee_address_migration(text,jsonb,uuid) line 30 at RAISE'
) =>
  new Error(
    `ERROR:  ${code}: ${message}\nCONTEXT:  PL/pgSQL function ${context}\nLOCATION:  exec_stmt_raise, pl_exec.c:1`
  );
const busy = () => claimSqlFailure(envelope());
const attempts = ['first', 'second'];
function fixture({
  outcomes = [true, false],
  journalChange = {},
  recordChange = {},
} = {}) {
  const before = {
    operation_id: 'operation',
    user_id: 'user',
    phase: 'reserved',
    attempt_id: null,
    binding: { operationId: 'operation' },
    original_state: { immutable: true },
    created_at: 'fixed',
    completed_at: null,
  };
  const winner = outcomes.findIndex((outcome) => outcome === true);
  const after = {
    ...before,
    phase: 'attempted',
    attempt_id: attempts[winner],
    ...journalChange,
  };
  let reads = 0;
  const claims = [];
  return {
    args: {
      attempts,
      operation: 'operation',
      user: 'user',
      claim: async (id) => {
        claims.push(id);
        const outcome = outcomes[attempts.indexOf(id)];
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      readJournal: async () => (++reads === 1 ? [before] : [after]),
      inspect: async () => ({
        authorized: true,
        revision: 0,
        sourceVerified: true,
        addressOwnership: 'same_identity',
        record: {
          binding: before.binding,
          phase: 'attempted',
          attemptId: attempts[winner],
          ...recordChange,
        },
      }),
    },
    claims,
    reads: () => reads,
  };
}
for (const [name, outcomes] of [
  ['false then winner', [false, true]],
  ['winner then false', [true, false]],
  ['busy then winner', [busy(), true]],
  ['winner then busy', [true, busy()]],
]) {
  test(`drained claims accept ${name} with matching durable capability`, async () => {
    const f = fixture({ outcomes });
    await qualifyParallelClaims(f.args);
    assert.deepEqual(f.claims, attempts);
    assert.equal(f.reads(), 2);
  });
}
for (const [name, outcomes] of [
  ['zero winners', [false, false]],
  ['two winners', [true, true]],
  ['two busy failures', [busy(), busy()]],
  ['unexpected rejection', [true, new Error('unexpected')]],
  ['undefined loser', [true, undefined]],
  [
    'generic message-only error',
    [true, new Error('Address migration admission busy')],
  ],
  ['uncategorized exact-looking error', [true, envelope()]],
  [
    'timeout',
    [
      true,
      claimSqlFailure(
        envelope('57014', 'canceling statement due to statement timeout')
      ),
    ],
  ],
  [
    'different 55P03 message',
    [true, claimSqlFailure(envelope('55P03', 'could not obtain lock on row'))],
  ],
  [
    'foreign origin',
    [
      true,
      claimSqlFailure(
        envelope(
          '55P03',
          'Address migration admission busy',
          'public.foreign_rpc() line 30 at RAISE'
        )
      ),
    ],
  ],
]) {
  test(`drained claims reject ${name}`, async () => {
    const f = fixture({ outcomes });
    await assert.rejects(qualifyParallelClaims(f.args));
    assert.deepEqual(f.claims, attempts);
    assert.equal(f.reads(), 2);
  });
}
for (const [name, journalChange, recordChange] of [
  ['wrong durable winner token', { attempt_id: 'second' }, {}],
  ['unchanged reserved phase', { phase: 'reserved' }, {}],
  [
    'loser modifies immutable state',
    { original_state: { immutable: false } },
    {},
  ],
  ['loser modifies binding', { binding: { operationId: 'other' } }, {}],
  ['wrong inspected capability', {}, { attemptId: 'second' }],
]) {
  test(`independent durable readback rejects ${name}`, async () => {
    const f = fixture({ journalChange, recordChange });
    await assert.rejects(qualifyParallelClaims(f.args));
  });
}
test('both attempts drain before any after-read, even when one rejects first', async () => {
  const f = fixture({ outcomes: [true, busy()] });
  let releaseWinner;
  const winner = new Promise((resolve) => {
    releaseWinner = resolve;
  });
  f.args.claim = (id) => {
    f.claims.push(id);
    return id === 'first' ? winner : Promise.reject(busy());
  };
  const pending = qualifyParallelClaims(f.args);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.claims, attempts);
  assert.equal(f.reads(), 1);
  releaseWinner(true);
  await pending;
  assert.equal(f.reads(), 2);
});
test('synchronous claim failures cannot prevent the second attempt draining', async () => {
  const f = fixture();
  f.args.claim = (id) => {
    f.claims.push(id);
    throw new Error('unexpected');
  };
  await assert.rejects(qualifyParallelClaims(f.args));
  assert.deepEqual(f.claims, attempts);
  assert.equal(f.reads(), 2);
});
test('missing or multiple durable journal rows cannot qualify', async () => {
  for (const rows of [[], [{}, {}]]) {
    const f = fixture();
    const original = f.args.readJournal;
    let reads = 0;
    f.args.readJournal = async () => (++reads === 1 ? original() : rows);
    await assert.rejects(qualifyParallelClaims(f.args));
  }
});
test('an additional ERROR record cannot masquerade as owned admission busy', async () => {
  const f = fixture({
    outcomes: [
      true,
      claimSqlFailure(
        new Error(`${envelope().message}\nERROR:  57014: timeout`)
      ),
    ],
  });
  await assert.rejects(qualifyParallelClaims(f.args));
});
