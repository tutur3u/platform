import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import * as retry from './meet-fence-retry.ts';

for (const rpc of ['reserve', 'complete', 'checkpoint']) {
  test(`${rpc}: lock retry is bounded and never proceeds without success`, async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retry.retryMeetFenceRpc(
      async () => {
        calls++;
        return calls < 3
          ? { data: null, error: { code: '55P03' } }
          : { data: 'fenced', error: null };
      },
      async (ms) => {
        waits.push(ms);
      }
    );
    assert.equal(result.data, 'fenced');
    assert.deepEqual(waits, [100, 200]);
    calls = 0;
    waits.length = 0;
    const refused = await retry.retryMeetFenceRpc(
      async () => {
        calls++;
        return { data: null, error: { code: '55P03' } };
      },
      async (ms) => {
        waits.push(ms);
      }
    );
    assert.equal(calls, 4);
    assert.equal(refused.data, null);
    assert.equal(refused.error?.code, '55P03');
    assert.deepEqual(waits, [100, 200, 400]);
  });
}
test('conflicts and other errors are not retried', async () => {
  for (const code of ['40001', '42501', 'P0001']) {
    let calls = 0;
    const result = await retry.retryMeetFenceRpc(
      async () => {
        calls++;
        return { data: null, error: { code } };
      },
      async () => {
        assert.fail('must not wait');
      }
    );
    assert.equal(calls, 1);
    assert.equal(result.error?.code, code);
  }
});
