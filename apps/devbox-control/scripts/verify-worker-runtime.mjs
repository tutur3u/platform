import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

// CI repeats the same checks with Vite's emitted configuration. Disposable secrets
// and rejected credentials keep every test away from Supabase and hosted runners.
if (process.env.DEVBOX_TEST_CONFIG) {
  const config = JSON.parse(
    readFileSync(process.env.DEVBOX_TEST_CONFIG, 'utf8')
  );
  assert.equal(config.name, 'tuturuuu-devbox-control');
  assert.equal(config.account_id, 'e8912e2867beecc673d171907bf09649');
  assert.equal(config.compatibility_date, '2026-09-28');
  // Devbox does not opt into Node compatibility; preserve that runtime contract.
  assert.deepEqual(config.compatibility_flags ?? [], []);
  assert.deepEqual(config.durable_objects.bindings, [
    { name: 'RUNNER_WAKE', class_name: 'RunnerWake' },
  ]);
  assert.deepEqual(config.migrations, [
    { tag: 'v1', new_sqlite_classes: ['RunnerWake'] },
  ]);
}
const server = createTestHarness({
  workers: [
    {
      configPath:
        process.env.DEVBOX_TEST_CONFIG ??
        fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
      secrets: {
        DEVBOX_CONTROL_INTERNAL_TOKEN: randomUUID() + randomUUID(),
        SUPABASE_URL: 'https://unreachable.example.invalid',
        SUPABASE_SECRET_KEY: 'isolated-devbox-runtime-fixture',
      },
    },
  ],
});
before(async () => {
  await server.listen();
});
after(async () => {
  await server.close();
});

test('serves complete private health JSON in the real Worker runtime', async () => {
  const response = await server.fetch('/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});
test('rejects unauthenticated runner and internal requests before remote access', async () => {
  for (const [path, method] of [
    ['/v1/poll', 'GET'],
    ['/v1/heartbeat', 'POST'],
    ['/v1/notify', 'POST'],
  ]) {
    const response = await server.fetch(path, { method });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: 'Unauthorized' });
  }
});
