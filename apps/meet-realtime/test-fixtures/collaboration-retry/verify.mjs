import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

test('real Worker/SQLite stops offline retries across handler reconstruction', async () => {
  const harness = createTestHarness({
    workers: [
      {
        configPath: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
      },
    ],
  });
  try {
    await harness.listen();
    const response = await harness.fetch('/verify');
    assert.equal(response.status, 200);
    const { before, after, retained } = await response.json();
    assert.equal(before.provider, 3);
    assert.equal(before.writes, 6);
    assert.equal(before.alarms, 2);
    assert.deepEqual(after, { ...before, reads: before.reads + 2 });
    assert.equal(retained, true);
  } finally {
    await harness.close();
  }
});
