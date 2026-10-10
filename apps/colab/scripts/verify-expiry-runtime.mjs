import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

const server = createTestHarness({
  workers: [
    {
      configPath: fileURLToPath(
        new URL('../test-fixtures/wrangler.jsonc', import.meta.url)
      ),
    },
  ],
});
before(async () => {
  await server.listen();
});
after(async () => {
  await server.close();
});
for (const path of ['/duplicates', '/failure']) {
  test(`real DO expiry is atomic and idempotent: ${path}`, {
    timeout: 30_000,
  }, async () => {
    const response = await server.fetch(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      revision: 1,
      mode: 'readonly',
      ended: 1,
      complete: true,
      nextAlarm: null,
    });
  });
}
