import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { RecipeFailure, cfQueueJob } from './release-cf-queue.mjs';
import { safeData } from './release-cf-queue-payload.mjs';
import {
  record,
  input,
  authority,
  successful,
  job,
  run,
  grant,
} from './release-cf-queue-test-helper.mjs';

for (const explicit of [false, true])
  test(`post-upload executor error cannot claim no contact (${explicit})`, async () => {
    let uploads = 0;
    const result = await run(authority(), async () => {
      uploads++;
      throw explicit
        ? {
            guardCode: 'UPLOAD_VERIFY_FAILED',
            guardPhase: 'publish',
            class: 'executor',
            terminal: true,
            providerContacted: false,
          }
        : new RecipeFailure('UPLOAD_VERIFY_FAILED', 'publish', 'executor');
    });
    assert.equal(uploads, 1);
    assert.equal(result.status, 'unknown');
    assert.equal(result.guardCode, 'RECONCILIATION_REQUIRED');
    assert.equal(result.cause.providerContacted, true);
  });
test('omitted contact flag defaults to effect state even for policy errors', async () => {
  const result = await run(authority(), async () => {
    throw new RecipeFailure('PRODUCTION_HELD', 'policy', 'policy');
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.providerContacted, true);
});
const jwt = [
  Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: 'fixture' })).toString('base64url'),
  'abcdef0123456789',
].join('.');
const forbidden = [
  'vcp_fixture',
  'vercel_fixture',
  'ghp_fixture',
  'github_pat_fixture',
  'cfat_fixture',
  jwt,
  'AbCDef0123456789XYZuvw-QRST9876543210mnopqr',
  'aBcD/eFgH1jK2lM3nO4pQ5rS6tU7vW8xY9z0ABCD',
];
for (const value of forbidden)
  test(`credential value is refused (${forbidden.indexOf(value)})`, async () => {
    const values = input();
    values.authorizationRefs = [value];
    assert.throws(() => cfQueueJob(structuredClone(record), values));
    const port = authority();
    const result = await run(port, async () => ({
      providerOperationId: 'version',
      verificationRefs: [value],
    }));
    assert.equal(result.status, 'unknown');
    assert.equal(JSON.stringify(result).includes(value), false);
  });
test('known hex IDs and digests are admitted by field and shape', async () => {
  const values = input();
  values.operationId = '0123456789abcdef'.repeat(2);
  values.artifact.id = '0123456789abcdef'.repeat(4);
  const payload = cfQueueJob(structuredClone(record), values);
  const current = {
    ...grant,
    jobId: 'fedcba9876543210'.repeat(2),
    attemptId: 'abcdef0123456789'.repeat(2),
  };
  const result = await run(authority(), successful, payload, current);
  assert.equal(result.status, 'succeeded');
  assert.doesNotThrow(() => safeData({ sha256: '0123456789abcdef'.repeat(4) }));
  assert.throws(() => safeData({ unreviewed: '0123456789abcdef'.repeat(4) }));
});
test('lease renewal extends an initial short lease within the job budget', async () => {
  const port = authority();
  const payload = job();
  payload.requirements.maxDurationMs = 2000;
  const current = {
    ...grant,
    leaseDeadline: new Date(Date.now() + 300).toISOString(),
  };
  let expectedLease = current.leaseDeadline;
  port.renew = async (value) => {
    assert.equal(value.leaseDeadline, expectedLease);
    expectedLease = new Date(Date.now() + 2000).toISOString();
    return { ...value, leaseDeadline: expectedLease };
  };
  const result = await run(
    port,
    async ({ checkFence }) => {
      await checkFence();
      await delay(450);
      return successful();
    },
    payload,
    current
  );
  assert.equal(result.status, 'succeeded');
});
test('extended leases cannot extend the maximum job duration', async () => {
  const port = authority();
  const payload = job();
  payload.requirements.maxDurationMs = 30;
  port.renew = async (value) => ({
    ...value,
    leaseDeadline: new Date(Date.now() + 10000).toISOString(),
  });
  const result = await run(port, async () => new Promise(() => {}), payload);
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.guardCode, 'DEADLINE_EXCEEDED');
});

test('protocol labels and fixed guard codes are not credential values', () => {
  assert.doesNotThrow(() =>
    safeData({ jobType: 'cf-wave1', guardCode: 'CF_UPLOAD_REFUSED' })
  );
});
