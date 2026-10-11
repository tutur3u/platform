import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

// No scheduled event is dispatched: HTTP checks cannot run the DB recovery RPC.
// CI repeats these checks on the actual Vite-emitted Worker configuration.
if (process.env.CRON_TEST_CONFIG) {
  const config = JSON.parse(readFileSync(process.env.CRON_TEST_CONFIG, 'utf8'));
  const source = JSON.parse(
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  );
  for (const key of [
    'name',
    'account_id',
    'compatibility_date',
    'triggers',
    'vars',
    'secrets',
  ]) {
    assert.deepEqual(config[key], source[key], `preserve ${key}`);
  }
  assert.deepEqual(config.triggers.crons, ['*/5 * * * *']);
}
const harness = createTestHarness({
  workers: [
    {
      configPath:
        process.env.CRON_TEST_CONFIG ??
        fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
      secrets: {
        CRON_CONTROL_DELIVERY_TOKEN: randomUUID() + randomUUID(),
        SUPABASE_SECRET_KEY: 'isolated-cron-runtime-fixture',
        SUPABASE_URL: 'https://unreachable.example.invalid',
      },
    },
  ],
});
before(async () => {
  await harness.listen();
});
after(async () => {
  await harness.close();
});

test('complete private health response from the real Worker', async () => {
  const response = await harness.fetch('/health', {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});
test('HTTP callers cannot invoke the scheduled processor', async () => {
  for (const [path, method] of [
    ['/health', 'POST'],
    ['/', 'GET'],
    ['/api/notifications/send-immediate', 'POST'],
  ]) {
    const response = await harness.fetch(path, {
      method,
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Not found' });
  }
});
