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
    const suffix = randomBytes(24).toString('hex');
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
