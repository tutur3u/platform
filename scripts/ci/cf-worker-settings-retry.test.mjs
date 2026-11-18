import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  retryMissingSecret,
  SECRET_LIST_RETRY_DELAYS_MS,
} from './cf-worker-settings-retry.mjs';

const missing = () =>
  new assert.AssertionError({
    message: 'missing declared secret COORDINATION_TOKEN',
  });

function harness() {
  const waits = [];
  return {
    waits,
    options: { sleep: async (ms) => waits.push(ms), log: () => {} },
  };
}

test('re-reads a lagging secrets list until the declared secret appears', async () => {
  const { waits, options } = harness();
  let calls = 0;
  const result = await retryMissingSecret(async () => {
    calls += 1;
    if (calls < 3) throw missing();
    return { secrets: ['COORDINATION_TOKEN'] };
  }, options);
  assert.deepEqual(result, { secrets: ['COORDINATION_TOKEN'] });
  assert.equal(calls, 3);
  assert.deepEqual(waits, SECRET_LIST_RETRY_DELAYS_MS.slice(0, 2));
});

test('fails with the original assertion once the bounded retries run out', async () => {
  const { waits, options } = harness();
  let calls = 0;
  await assert.rejects(
    retryMissingSecret(async () => {
      calls += 1;
      throw missing();
    }, options),
    /missing declared secret COORDINATION_TOKEN/
  );
  assert.equal(calls, SECRET_LIST_RETRY_DELAYS_MS.length + 1);
  assert.deepEqual(waits, SECRET_LIST_RETRY_DELAYS_MS);
  assert.ok(
    SECRET_LIST_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) <= 90_000
  );
});

test('does not retry any other settings difference or runtime error', async () => {
  for (const error of [
    new assert.AssertionError({ message: 'cron schedules differ' }),
    new TypeError('fetch failed'),
  ]) {
    const { waits, options } = harness();
    let calls = 0;
    await assert.rejects(
      retryMissingSecret(async () => {
        calls += 1;
        throw error;
      }, options),
      (thrown) => thrown === error
    );
    assert.equal(calls, 1);
    assert.deepEqual(waits, []);
  }
});
