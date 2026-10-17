import assert from 'node:assert/strict';

class ClaimSqlFailure extends Error {
  constructor(admissionBusy) {
    super('Claim SQL rejection');
    this.admissionBusy = admissionBusy;
    Object.freeze(this);
  }
}

export function claimSqlFailure(error) {
  if (!(error instanceof Error) || error.message.length > 4096)
    return new Error('Unrecognized claim failure');
  const lines = error.message.split(/\r?\n/u);
  const errors = lines.filter((line) => line.startsWith('ERROR:'));
  const contexts = lines.filter((line) => line.startsWith('CONTEXT:'));
  return new ClaimSqlFailure(
    errors.length === 1 &&
      contexts.length === 1 &&
      /^ERROR:\s+55P03: Address migration admission busy$/u.test(errors[0]) &&
      /^CONTEXT:\s+PL\/pgSQL function private\.employee_address_migration\(text,jsonb,uuid\) line 30 at RAISE$/u.test(
        contexts[0]
      )
  );
}

export async function qualifyParallelClaims({
  attempts,
  claim,
  readJournal,
  inspect,
  operation,
  user,
}) {
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0], attempts[1]);
  const before = await readJournal();
  assert.equal(before.length, 1);
  assert.equal(before[0].operation_id, operation);
  assert.equal(before[0].user_id, user);
  assert.equal(before[0].phase, 'reserved');
  assert.equal(before[0].attempt_id, null);
  const outcomes = await Promise.allSettled(
    attempts.map(async (id) => claim(id))
  );
  const after = await readJournal();
  const inspection = await inspect();
  const winners = outcomes.flatMap((result, index) =>
    result.status === 'fulfilled' && result.value === true ? [index] : []
  );
  assert.equal(winners.length, 1, 'Exactly one claim must return a capability');
  const winner = winners[0];
  const loser = outcomes[1 - winner];
  if (loser.status === 'fulfilled')
    assert.equal(
      loser.value,
      false,
      'A fulfilled losing claim must return false'
    );
  else
    assert.ok(
      loser.reason instanceof ClaimSqlFailure && loser.reason.admissionBusy,
      'Rejected loser must be exact owned SQLSTATE 55P03 admission busy'
    );
  assert.deepEqual(
    after,
    [{ ...before[0], phase: 'attempted', attempt_id: attempts[winner] }],
    'Only winning phase/token may change in the durable journal'
  );
  assert.equal(inspection.authorized, true);
  assert.equal(inspection.revision, 0);
  assert.equal(inspection.sourceVerified, true);
  assert.equal(inspection.addressOwnership, 'same_identity');
  assert.deepEqual(
    inspection.record,
    {
      binding: before[0].binding,
      phase: 'attempted',
      attemptId: attempts[winner],
    },
    'Inspected capability must identify the sole durable winning attempt'
  );
}
