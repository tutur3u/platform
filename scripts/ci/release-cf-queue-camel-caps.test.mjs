import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import test from 'node:test';
import { metadataStringIsSafe } from './release-cf-queue-payload.mjs';
import { cfQueueJob } from './release-cf-queue.mjs';
import {
  record,
  input,
  authority,
  job,
  run,
} from './release-cf-queue-test-helper.mjs';
const lower = (length) =>
  Array.from(randomBytes(length), (byte) =>
    String.fromCharCode(97 + (byte % 26))
  ).join('');
const word = (length) => 'Z' + lower(length - 1);
function randomRun(length) {
  const words = [];
  let remaining = length;
  while (remaining) {
    let size = remaining <= 24 ? remaining : randomInt(2, 25);
    if (remaining - size === 1) size--;
    words.push(words.length ? word(size) : 'z' + lower(size - 1));
    remaining -= size;
  }
  return words.join('');
}
const shapes = [
  [
    '24 lower plus capital plus 24 lower',
    () => 'z' + lower(23) + 'Z' + lower(24),
  ],
  [
    'two 24-letter words plus a word',
    () => 'z' + lower(23) + word(24) + word(2),
  ],
  [
    'random 40..144-character bounded words',
    (sample) => {
      const length = 40 + (sample % 105);
      return length <= 48
        ? Array.from({ length: (length / 2) | 0 }, (_, i) =>
            i ? word(2) : 'zz'
          ).join('') + (length % 2 ? 'z' : '')
        : randomRun(length);
    },
  ],
  [
    'alternating camel words',
    (sample) =>
      'abCdEfGhIjKlMnOpQrStUvWxYz'.repeat(6).slice(0, 40 + (sample % 53) * 2),
  ],
];
for (const [name, generate] of shapes)
  test(`2000 ${name} samples refuse over-cap runs end to end`, async () => {
    const valid = job();
    let begins = 0;
    for (let sample = 0; sample < 2000; sample++) {
      const value = generate(sample);
      const words = value.split(/(?=[A-Z])/);
      assert.ok(value.length > 48 || words.length > 8);
      assert.equal(metadataStringIsSafe(value, 'unreviewed'), false);
      const values = input();
      values.authorizationRefs = [value];
      assert.throws(() => cfQueueJob(structuredClone(record), values));
      const payload = structuredClone(valid);
      payload.authorizationRefs = [value];
      const refused = authority();
      refused.beginPhase = async () => {
        begins++;
        throw new Error('Unexpected authority contact');
      };
      await assert.rejects(() =>
        run(
          refused,
          async () => {
            begins++;
          },
          payload
        )
      );
      const port = authority();
      const receipt = await run(
        port,
        async () => ({ providerOperationId: value, verificationRefs: [value] }),
        valid
      );
      assert.equal(receipt.status, 'unknown');
      assert.equal(JSON.stringify(receipt).includes(value), false);
      assert.equal(
        JSON.stringify([...port.state.receipts.values()]).includes(value),
        false
      );
    }
    assert.equal(begins, 0);
  });
test('readable camelCase accepts exactly eight words and forty-eight characters', async () => {
  const pairs = [
    ['work' + 'Name'.repeat(7), 'work' + 'Name'.repeat(8)],
    ['render' + 'Target'.repeat(7), 'renders' + 'Target'.repeat(7)],
  ];
  assert.equal(pairs[0][0].split(/(?=[A-Z])/).length, 8);
  assert.equal(pairs[0][1].split(/(?=[A-Z])/).length, 9);
  assert.equal(pairs[1][0].length, 48);
  assert.equal(pairs[1][1].length, 49);
  for (const [allowed, refused] of pairs) {
    assert.equal(metadataStringIsSafe(allowed, 'unreviewed'), true);
    assert.equal(metadataStringIsSafe(refused, 'unreviewed'), false);
    assert.equal(
      (
        await run(authority(), async () => ({
          providerOperationId: allowed,
          verificationRefs: [allowed],
        }))
      ).status,
      'succeeded'
    );
    assert.equal(
      (
        await run(authority(), async () => ({
          providerOperationId: refused,
          verificationRefs: [refused],
        }))
      ).status,
      'unknown'
    );
  }
  const insideCaps = 'z'.repeat(24) + 'Z' + 'z'.repeat(23);
  assert.equal(insideCaps.length, 48);
  assert.equal(metadataStringIsSafe(insideCaps, 'unreviewed'), true);
});
