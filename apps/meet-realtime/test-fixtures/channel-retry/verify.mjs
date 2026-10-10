import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

for (const scenario of ['provider-failure', 'completion-failure']) {
  test(`real Worker/SQLite reserves finite channel attempts: ${scenario}`, async () => {
    const harness = createTestHarness({
      workers: [
        {
          configPath: fileURLToPath(
            new URL('./wrangler.jsonc', import.meta.url)
          ),
        },
      ],
    });
    try {
      await harness.listen();
      const response = await harness.fetch(`/${scenario}`);
      assert.equal(response.status, 200);
      const { before, after, metadata } = await response.json();
      assert.equal(before.provider, 3);
      assert.equal(before.reservations, 3);
      assert.equal(before.completions, 3);
      assert.equal(before.alarms, scenario === 'completion-failure' ? 0 : 2);
      assert.deepEqual(after, before);
      assert.equal(metadata.checkpointRetry.attempts, 3);
      assert.equal(metadata.documentId, 'document');
    } finally {
      await harness.close();
    }
  });
}
