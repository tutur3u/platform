import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { metadataStringIsSafe } from './release-cf-queue-payload.mjs';
import { cfQueueJob, submitCfJob } from './release-cf-queue.mjs';
import {
  record,
  input,
  authority,
  job,
  run,
} from './release-cf-queue-test-helper.mjs';

for (const shape of ['host-label', 'dot-segment'])
  test(`2000 artifact URLs reject ${shape} before every authority boundary`, async () => {
    const valid = job();
    let contacts = 0;
    const port = authority();
    port.submit = port.beginPhase = async () => {
      contacts++;
      throw new Error('Unexpected authority contact');
    };
    for (let sample = 0; sample < 2000; sample++) {
      const secret = randomBytes(19).toString('hex').slice(0, 37),
        digest = randomBytes(32).toString('hex');
      const value =
        shape === 'host-label'
          ? `https://${secret}.tuturuuu.com/sealed/${digest}`
          : `https://finance.tuturuuu.com/${secret}/../sealed/${digest}`;
      const values = input();
      values.artifact.id = value;
      assert.throws(() => cfQueueJob(structuredClone(record), values));
      const payload = structuredClone(valid);
      payload.artifact.id = value;
      await assert.rejects(() => submitCfJob(port, payload));
      await assert.rejects(() =>
        run(
          port,
          async () => {
            contacts++;
          },
          payload
        )
      );
    }
    assert.equal(contacts, 0);
  });
test('artifact URLs require canonical bytes and the app canonical host', async () => {
  const digest = randomBytes(32).toString('hex');
  for (const value of [
    `https://finance.tuturuuu.com/./sealed/${digest}`,
    `https://finance.tuturuuu.com:443/sealed/${digest}`,
    `https://finance.tuturuuu.com:8443/sealed/${digest}`,
    `https://FINANCE.tuturuuu.com/sealed/${digest}`,
    `https://finance.tuturuuu.com/%73ealed/${digest}`,
    `https://finance.tuturuuu.com/sealed/%61${digest.slice(1)}`,
    `https://owner@finance.tuturuuu.com/sealed/${digest}`,
    `https://finance.tuturuuu.com/sealed/${digest}?x=1`,
    `https://finance.tuturuuu.com/sealed/${digest}#x`,
    `https://mail.tuturuuu.com/sealed/${digest}`,
    `https://artifacts.tuturuuu.com/sealed/${digest}`,
    `https://tuturuuu.com/sealed/${digest}`,
    `http://finance.tuturuuu.com/sealed/${digest}`,
  ]) {
    const values = input();
    values.artifact.id = value;
    assert.throws(() => cfQueueJob(structuredClone(record), values));
  }
  const values = input();
  values.artifact.id = `https://finance.tuturuuu.com/sealed/${digest}`;
  const payload = cfQueueJob(structuredClone(record), values);
  const port = authority();
  await submitCfJob(port, payload);
  assert.equal((await run(port, undefined, payload)).status, 'succeeded');
  assert.equal([...port.state.jobs.values()].length, 1);
});
const slugs = [
  'cf-wave1-finance-production-publish',
  'cf-wave1-finance-camelCase-production',
  'release-2026-11-17-finance-production-publish',
  'cloudflare-workers-deploy-wave1',
  'cf-wave1/tuturuuu-finance/version-readback/latest',
  'operation-finance-publish-attempt-0002',
  'tuturuuu-finance-production-2026',
  'wave1-native-finance-cutover-packet-v2',
  'thread/d363-lead/d401-cf-release-recipe',
  'releaseRecipeFinanceProductionPublish',
  'ProductionPublicationPolicyCheckpoint',
  'finance-production-deploy-approval-ref-0001',
  'github:tutur3u/platform/actions/runs/19234567890',
];
test('readable digit-bearing and camelCase slugs pass all metadata positions', async () => {
  for (const value of slugs) {
    for (const field of [
      'unreviewed',
      'authorizationRefs',
      'verificationRefs',
      'providerOperationId',
      'actor',
      'owningThread',
    ])
      assert.equal(metadataStringIsSafe(value, field), true, value);
    const values = input();
    values.authorizationRefs = [value];
    values.provenance = { actor: value, owningThread: value };
    const payload = cfQueueJob(structuredClone(record), values);
    const result = await run(
      authority(),
      async () => ({ providerOperationId: value, verificationRefs: [value] }),
      payload
    );
    assert.equal(result.status, 'succeeded', value);
  }
});
test('2000 wrapper and chained slug cases keep opaque segments refused', () => {
  for (let sample = 0; sample < 2000; sample++) {
    const uuid = randomUUID(),
      secret = randomBytes(20).toString('hex');
    const mixed = randomBytes(24).toString('base64url');
    for (const slug of slugs) {
      for (const wrapper of [
        `${slug}:${uuid}`,
        `job-${uuid}/${slug}`,
        `${uuid}-${uuid}/${slug}`,
      ])
        assert.equal(metadataStringIsSafe(wrapper, 'verificationRefs'), true);
      for (const value of [
        `${slug}:${secret}`,
        `${uuid}-${secret}`,
        `${slug}/${mixed}`,
        `job-${uuid}-${mixed}`,
        `${mixed}/${slug}`,
      ])
        assert.equal(metadataStringIsSafe(value, 'verificationRefs'), false);
    }
  }
});

test('mixed thirty-character opaque segments and chained hex are refused', () => {
  for (const value of [
    'aB3dE5gH7jK9mN2pQ4sT6vW8yZ0cF1',
    'ab3de5gh7jk9mn2pq4st6vw8yz0cf1x',
    '1234abcdef12-3456abcdef78-90abcdef1234',
  ]) {
    for (const wrapper of [value, `job-${value}`, `refs/${value}/latest`])
      assert.equal(metadataStringIsSafe(wrapper, 'verificationRefs'), false);
  }
});
