import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { metadataStringIsSafe, safeData } from './release-cf-queue-payload.mjs';
import { cfQueueJob } from './release-cf-queue.mjs';
import {
  record,
  input,
  authority,
  run,
} from './release-cf-queue-test-helper.mjs';
const separators = [':', '/', '-', '_', '.', '=', '+', '@', ' ', '\t', '\n'];
const prefixes = ['x', 'cf', 'key', 'X-Auth-Key'];
const fields = [
  'authorizationRefs',
  'approvalRefs',
  'verificationRefs',
  'providerOperationId',
  'deploymentId',
  'unreviewed',
];
const shapes = {
  hex37: () => randomBytes(19).toString('hex').slice(0, 37),
  hex40: () => randomBytes(20).toString('hex'),
  hex64: () => randomBytes(32).toString('hex'),
  base64: () => randomBytes(30).toString('base64'),
  base64url: () => randomBytes(30).toString('base64url'),
  lower32: () =>
    Array.from(
      randomBytes(32),
      (byte) => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]
    ).join(''),
  originCA: () =>
    `v1.0-${randomBytes(8).toString('hex')}-${randomBytes(8).toString('hex')}`,
};
for (const [shape, generate] of Object.entries(shapes))
  test(`2000 ${shape} samples reject every separator, prefix and suffix`, () => {
    for (let sample = 0; sample < 2000; sample++) {
      const secret = generate();
      for (const separator of separators)
        for (const prefix of prefixes) {
          for (const value of [
            `${prefix}${separator}${secret}`,
            `${secret}${separator}${prefix}`,
            `${prefix}${separator}${secret}${separator}${prefix}`,
          ]) {
            for (const field of fields)
              assert.equal(
                metadataStringIsSafe(value, field),
                false,
                `${shape}/${sample}/${field}`
              );
          }
        }
    }
  });
test('separator scans apply through every nested container and receipt identity', async () => {
  const secret = randomBytes(19).toString('hex');
  for (const separator of separators)
    for (const prefix of prefixes) {
      const value = `${prefix}${separator}${secret}`;
      assert.throws(() => safeData({ nested: [{ deep: { value } }] }));
      const values = input();
      values.authorizationRefs = [value];
      assert.throws(() => cfQueueJob(structuredClone(record), values));
      const result = await run(authority(), async () => ({
        providerOperationId: value,
        verificationRefs: [value],
      }));
      assert.equal(result.status, 'unknown');
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
});
test('2000 exact declared IDs and pinned readback formats remain admissible', () => {
  for (let sample = 0; sample < 2000; sample++) {
    const uuid = randomUUID(),
      hex32 = randomBytes(16).toString('hex'),
      hex64 = randomBytes(32).toString('hex');
    for (const field of [
      'operationId',
      'jobId',
      'attemptId',
      'providerOperationId',
      'authorizationRef',
    ])
      assert.equal(metadataStringIsSafe(uuid, field), true);
    assert.equal(metadataStringIsSafe(hex32, 'jobId'), true);
    assert.equal(metadataStringIsSafe(hex64, 'sha256'), true);
    assert.equal(metadataStringIsSafe(hex64, 'id', 'artifact'), true);
    assert.equal(metadataStringIsSafe(hex32, 'id'), false);
    assert.equal(
      metadataStringIsSafe(
        `workers/tuturuuu-finance/deployments/${uuid}`,
        'verificationRefs'
      ),
      true
    );
    assert.equal(
      metadataStringIsSafe(`readback/finance/${hex64}`, 'verificationRefs'),
      true
    );
    assert.equal(
      metadataStringIsSafe(`readback/finance/${hex64}`, 'authorizationRefs'),
      false
    );
    assert.equal(
      metadataStringIsSafe(`other/finance/${hex64}`, 'verificationRefs'),
      false
    );
  }
});
test('unsupported informational reference shapes fail safe and keep provider identity', async () => {
  for (const ref of [
    `readback:finance/${randomBytes(16).toString('hex')}`,
    `https://dash.cloudflare.com/${randomBytes(16).toString('hex')}`,
  ]) {
    const result = await run(authority(), async () => ({
      providerOperationId: 'known-version',
      verificationRefs: [ref],
    }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.providerOperationId, 'known-version');
  }
});

test('2000 UUID tokens and ordinary slug refs have no false positives', async () => {
  const slug = 'a-long-kebab-case-reference-with-ordinary-readable-words';
  for (let sample = 0; sample < 2000; sample++) {
    const uuid = randomUUID();
    for (const value of [uuid, `job-${uuid}`, `refs/${uuid}/latest`, slug]) {
      for (const field of [
        'verificationRefs',
        'authorizationRefs',
        'actor',
        'owningThread',
        'unreviewed',
      ])
        assert.equal(metadataStringIsSafe(value, field), true);
      assert.doesNotThrow(() =>
        safeData({
          provenance: { actor: `job-${uuid}`, owningThread: uuid },
          verificationRefs: [value],
        })
      );
    }
  }
  const uuid = randomUUID();
  const values = input();
  values.provenance = { actor: uuid, owningThread: `job-${uuid}` };
  values.authorizationRefs = [`job-${uuid}`];
  assert.doesNotThrow(() => cfQueueJob(structuredClone(record), values));
  const result = await run(authority(), async () => ({
    providerOperationId: `job-${uuid}`,
    verificationRefs: [slug, `refs/${uuid}/latest`],
  }));
  assert.equal(result.status, 'succeeded');
});
