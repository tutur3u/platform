import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';
import { assertCronSet } from './assert-cron-set.mjs';

// No scheduled event is dispatched: HTTP checks cannot run the DB recovery RPC.
// Source mode serves cloudflare.config.ts through the Vite dev runtime; CI sets
// CRON_TEST_BUILD_OUTPUT=1 to repeat the checks on the emitted cf Build Output
// that `cf deploy --prebuilt` publishes. Enabled-job slot claims, restarts,
// stop/resume and the failure budget are covered by the ledger, dispatch and
// control unit tests: this harness takes only declared secrets and the
// configured job list; the production configuration enables only retention.
const root = fileURLToPath(new URL('..', import.meta.url));
const TRIGGERS = [
  '*/5 * * * *',
  '17 3 * * *',
  '0 */12 * * *',
  '0 6 * * *',
  '0 */6 * * *',
  '*/10 * * * *',
  '*/15 * * * *',
  '*/30 * * * *',
  '* * * * *',
];
const operatorToken = randomUUID() + randomUUID();
let worker;

before(async () => {
  worker = await startCfViteWorker({
    root,
    mode:
      process.env.CRON_TEST_BUILD_OUTPUT === '1' ? 'build-output' : 'source',
    secrets: {
      CRON_CONTROL_DELIVERY_TOKEN: randomUUID() + randomUUID(),
      CRON_CONTROL_OPERATOR_TOKEN: operatorToken,
      SUPABASE_SECRET_KEY: 'isolated-cron-runtime-fixture',
      SUPABASE_URL: 'https://unreachable.example.invalid',
    },
  });
});
after(async () => {
  await worker?.close();
});

test('source config keeps every schedule and enables only database history retention', async () => {
  const { default: config } = await import(
    pathToFileURL(`${root}/cloudflare.config.ts`).href
  );
  assertCronSet(
    config.worker.triggers.map((trigger) => trigger.schedule),
    TRIGGERS
  );
  assert.deepEqual(config.worker.env.CRON_CONTROL_ENABLED_JOBS, {
    type: 'text',
    value: 'database-cron-history-retention',
  });
  assert.deepEqual(config.worker.env.CRON_CONTROL_WORKER_PROCESSORS, {
    type: 'text',
    value: '',
  });
  assert.equal(config.worker.env.CRON_CONTROL_OPERATOR_TOKEN.type, 'secret');
  assert.equal(config.worker.env.CRON_LEDGER.type, 'durable-object');
  assert.ok(config.worker.exports.CronLedger, 'CronLedger is exported');
});
test('complete private health response from the real Worker', async () => {
  const response = await worker.fetch('/health', {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});
test('HTTP callers cannot invoke processors or unauthenticated control', async () => {
  for (const [path, method, authorization] of [
    ['/health', 'POST'],
    ['/', 'GET'],
    ['/api/notifications/send-immediate', 'POST'],
    ['/control/jobs', 'GET'],
    [
      '/control/jobs/tasks-cleanup-media/resume',
      'POST',
      `Bearer ${randomUUID()}`,
    ],
  ]) {
    const response = await worker.fetch(path, {
      method,
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Not found' });
  }
});

test('web execution stop, owner, active run and duplicate fences survive workerd restarts', async () => {
  const job = 'web-deadline-reminders';
  const slot = Math.floor(Date.now() / 300_000) * 300_000;
  const id = randomUUID();
  const call = async (action) => {
    const response = await worker.fetch(`/control/web-crons/${job}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, ...(await response.json()) };
  };
  assert.equal(
    (await call({ kind: 'acquire', owner: 'cloudflare', id, slot })).reason,
    'owner'
  );
  assert.equal(
    (await call({ kind: 'acquire', owner: 'vercel', id, slot })).ok,
    true
  );
  await worker.restart();
  assert.equal(
    (await call({ kind: 'owner', owner: 'cloudflare' })).reason,
    'unresolved-run'
  );
  assert.equal(
    (await call({ kind: 'acquire', owner: 'vercel', id: randomUUID(), slot }))
      .reason,
    'unresolved-run'
  );
  assert.equal((await call({ kind: 'stop' })).ok, true);
  await worker.restart();
  assert.equal(
    (await call({ kind: 'acquire', owner: 'vercel', id: randomUUID(), slot }))
      .reason,
    'stopped'
  );
  assert.equal((await call({ kind: 'complete', id })).ok, true);
  assert.equal((await call({ kind: 'owner', owner: 'cloudflare' })).ok, true);
  assert.equal((await call({ kind: 'resume' })).ok, true);
  await worker.restart();
  assert.equal(
    (
      await call({
        kind: 'acquire',
        owner: 'cloudflare',
        id: randomUUID(),
        slot,
      })
    ).reason,
    'duplicate'
  );
  assert.equal((await call({ kind: 'status' })).state.owner, 'cloudflare');
});
