import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

const letters = (length) =>
  Array.from(randomBytes(length), (byte) =>
    String.fromCharCode(97 + (byte % 26))
  ).join('');
const cases = [
  ['camel-lower32', () => `releaseRecipe${letters(32)}`],
  ['camel-lower48', () => `releaseRecipe${letters(48)}`],
  ['camel-lower64', () => `abC${letters(64)}`],
  ['lower32-camel', () => `${letters(32)}FinanceProd`],
];
for (const [shape, generate] of cases)
  test(`2000 ${shape} samples cannot enter jobs or receipts`, async () => {
    const valid = job();
    let contacts = 0;
    const refused = authority();
    refused.submit = refused.beginPhase = async () => {
      contacts++;
      throw new Error('Unexpected authority contact');
    };
    for (let sample = 0; sample < 2000; sample++) {
      const value = generate();
      for (const field of [
        'unreviewed',
        'authorizationRefs',
        'verificationRefs',
        'providerOperationId',
        'actor',
        'owningThread',
      ])
        assert.equal(metadataStringIsSafe(value, field), false, shape);
      const values = input();
      values.authorizationRefs = [value];
      assert.throws(() => cfQueueJob(structuredClone(record), values));
      const payload = structuredClone(valid);
      payload.authorizationRefs = [value];
      await assert.rejects(() => submitCfJob(refused, payload));
      await assert.rejects(() =>
        run(
          refused,
          async () => {
            contacts++;
          },
          payload
        )
      );
      const port = authority();
      const result = await run(
        port,
        async () => ({ providerOperationId: value, verificationRefs: [value] }),
        valid
      );
      assert.equal(result.status, 'unknown');
      assert.equal(JSON.stringify(result).includes(value), false);
      assert.equal(
        JSON.stringify([...port.state.receipts.values()]).includes(value),
        false
      );
    }
    assert.equal(contacts, 0);
  });
test('camelCase word limits count the capital as part of each word', () => {
  const pairs = [
    ['x'.repeat(24) + 'FinanceProd', 'x'.repeat(25) + 'FinanceProd'],
    [
      'A' + 'x'.repeat(23) + 'FinanceProd',
      'A' + 'x'.repeat(24) + 'FinanceProd',
    ],
    ['releaseRecipeF' + 'x'.repeat(23), 'releaseRecipeF' + 'x'.repeat(24)],
  ];
  for (const [allowed, refused] of pairs) {
    assert.equal(metadataStringIsSafe(allowed, 'verificationRefs'), true);
    assert.equal(metadataStringIsSafe(refused, 'verificationRefs'), false);
  }
});
