import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

// Source mode serves cloudflare.config.ts through the Vite dev runtime; CI sets
// DEVBOX_TEST_BUILD_OUTPUT=1 to repeat the checks on the emitted cf Build Output.
// Disposable secrets and rejected credentials keep every test away from
// Supabase and hosted runners.
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
before(async () => {
  server = await startCfViteWorker({
    root,
    mode:
      process.env.DEVBOX_TEST_BUILD_OUTPUT === '1' ? 'build-output' : 'source',
    secrets: {
      DEVBOX_CONTROL_INTERNAL_TOKEN: randomUUID() + randomUUID(),
      SUPABASE_URL: 'https://unreachable.example.invalid',
      SUPABASE_SECRET_KEY: 'isolated-devbox-runtime-fixture',
    },
  });
});
after(async () => {
  await server?.close();
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
test('binds RunnerWake as the SQLite Durable Object namespace', async () => {
  // The Local Explorer reflects the namespaces workerd created from `exports`.
  const response = await server.fetch(
    '/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces'
  );
  assert.equal(response.status, 200);
  const { result } = await response.json();
  const runnerWake = result.filter((entry) => entry.class === 'RunnerWake');
  assert.deepEqual(
    runnerWake.map(({ script, use_sqlite }) => ({ script, use_sqlite })),
    [{ script: 'tuturuuu-devbox-control', use_sqlite: true }]
  );
});
