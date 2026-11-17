import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { tokenShaped, unsafeValues } from './release-vercel-values.mjs';

test('random encoded credentials are refused behind every separator and prefix', () => {
  const separators = [':', '/', '-', '_', '.', '=', '+', '@', ' ', '\t', '\n'];
  for (const length of [32, 40, 64]) {
    for (const encoding of ['hex', 'base64', 'base64url']) {
      for (let i = 0; i < 1000; i++) {
        const value = randomBytes(length).toString(encoding).slice(0, length);
        assert.equal(tokenShaped(value), true);
        for (const separator of separators) {
          const wrapped = `x${separator}${value}`;
          assert.equal(unsafeValues({ note: wrapped }), true);
          assert.equal(
            unsafeValues({ executorHost: `${wrapped}.runner.local` }),
            true
          );
        }
      }
    }
  }
});
test('digest exemptions apply only at declared authority paths', () => {
  const digest = 'a'.repeat(64);
  assert.equal(unsafeValues({ targetLockId: digest }, 'grant'), false);
  assert.equal(
    unsafeValues({ receiptSha256: digest }, 'originalAttempt'),
    false
  );
  for (const field of ['targetLockId', 'receiptSha256']) {
    assert.equal(unsafeValues({ [field]: digest }), true);
    for (const context of ['grant', 'originalAttempt']) {
      assert.equal(
        unsafeValues({ nested: { [field]: digest } }, context),
        true
      );
    }
  }
});
test('declared provider and queue identifiers remain accepted', () => {
  for (let i = 0; i < 2000; i++) {
    const suffix = randomBytes(14).toString('hex');
    assert.equal(unsafeValues({ projectId: `prj_${suffix}` }), false);
    assert.equal(unsafeValues({ candidate: { id: `dpl_${suffix}` } }), false);
    assert.equal(unsafeValues({ jobId: randomUUID() }), false);
    assert.equal(unsafeValues({ note: `prj_${suffix}` }), true);
    assert.equal(
      unsafeValues({ nested: { projectId: `prj_${suffix}` } }),
      true
    );
  }
  assert.equal(
    unsafeValues({ executorHost: 'runner-01.studio-ci.tuturuuu' }),
    false
  );
});

test('canonical UUID tokens and ordinary kebab references are safe at every position', () => {
  const uuid = randomUUID();
  for (const value of [
    uuid,
    uuid.toUpperCase(),
    `job-stage-${uuid}`,
    `approval:${uuid}`,
    'environment:vercel-production-calendar-approval',
    'release-desk-calendar-production-operator',
  ]) {
    for (const record of [
      { provenance: { thread: value } },
      { approvalVerificationId: value },
      { approval: { reference: value } },
      { targetLockId: value },
      { jobId: value },
      { authorizationRefs: [value] },
      { executorHost: `${value}.runner.local` },
    ])
      assert.equal(unsafeValues(record), false, value);
  }
});
test('provider IDs have path-specific real formats and cannot wrap a credential', () => {
  assert.equal(
    unsafeValues({
      target: {
        account: 'team_' + 'a'.repeat(24),
        project: 'prj_' + 'b'.repeat(28),
      },
    }),
    false
  );
  for (const value of [
    'dpl_' + 'a'.repeat(64),
    'dpl_' + 'b'.repeat(96),
    'team_' + 'c'.repeat(64),
  ]) {
    assert.equal(unsafeValues({ candidate: { id: value } }), true);
    assert.equal(unsafeValues({ rollback: { deploymentId: value } }), true);
  }
  assert.equal(unsafeValues({ projectId: 'dpl_' + 'a'.repeat(28) }), true);
  assert.equal(
    unsafeValues({ candidate: { id: 'prj_' + 'a'.repeat(28) } }),
    true
  );
});
