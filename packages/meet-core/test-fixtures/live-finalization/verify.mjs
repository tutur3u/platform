import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

test('SQLite-confirmed completed finalization avoids writes across 24 reconstructions', async () => {
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
    const { count, retained } = await response.json();
    assert.deepEqual(count, {
      reads: 48,
      writes: 0,
      lists: 0,
      deletes: 0,
      alarms: 0,
      downstream: 0,
    });
    assert.equal(retained.contextErased, true);
    assert.equal(retained.billingFinalized, true);
    assert.equal(retained.claims.ownerId, 'disposable-owner');
  } finally {
    await harness.close();
  }
});
