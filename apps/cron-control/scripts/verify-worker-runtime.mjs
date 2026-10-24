import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

// No scheduled event is dispatched: HTTP checks cannot run the DB recovery RPC.
// Source mode serves cloudflare.config.ts through the Vite dev runtime; CI sets
// CRON_TEST_BUILD_OUTPUT=1 to repeat the checks on the emitted cf Build Output
// that `cf deploy --prebuilt` publishes.
const root = fileURLToPath(new URL('..', import.meta.url));
let worker;

before(async () => {
  worker = await startCfViteWorker({
    root,
    mode:
      process.env.CRON_TEST_BUILD_OUTPUT === '1' ? 'build-output' : 'source',
    secrets: {
      CRON_CONTROL_DELIVERY_TOKEN: randomUUID() + randomUUID(),
      SUPABASE_SECRET_KEY: 'isolated-cron-runtime-fixture',
      SUPABASE_URL: 'https://unreachable.example.invalid',
    },
  });
});
after(async () => {
  await worker?.close();
});

test('complete private health response from the real Worker', async () => {
  const response = await worker.fetch('/health', {
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
    const response = await worker.fetch(path, {
      method,
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Not found' });
  }
});
