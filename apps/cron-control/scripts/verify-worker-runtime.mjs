import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

// Scheduled events run against a loopback processor fixture with disposable
// secrets and isolated Durable Object storage. The immediate-notification
// trigger is never dispatched: it would call the database recovery RPC.
// CI repeats these checks on the actual Vite-emitted Worker configuration.
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
const source = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
);
assert.deepEqual(source.triggers.crons, TRIGGERS);
assert.equal(source.vars.CRON_CONTROL_ENABLED_JOBS, '', 'jobs default off');
assert.equal(
  source.vars.CRON_CONTROL_WORKER_PROCESSORS,
  '',
  'Worker processors default off'
);
if (process.env.CRON_TEST_CONFIG) {
  const config = JSON.parse(readFileSync(process.env.CRON_TEST_CONFIG, 'utf8'));
  for (const key of [
    'name',
    'account_id',
    'compatibility_date',
    'triggers',
    'vars',
    'secrets',
    'durable_objects',
    'migrations',
  ]) {
    assert.deepEqual(config[key], source[key], `preserve ${key}`);
  }
}

const processorCalls = [];
let processorStatus = 200;
const processor = createServer((request, response) => {
  processorCalls.push({
    authorization: request.headers.authorization,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
  });
  response.writeHead(processorStatus, { 'Content-Type': 'application/json' });
  response.end('{}');
});
await new Promise((resolve) => processor.listen(0, '127.0.0.1', resolve));
const { port } = processor.address();

const cronSecret = randomUUID() + randomUUID();
const operatorToken = randomUUID() + randomUUID();
const harness = createTestHarness({
  workers: [
    {
      configPath:
        process.env.CRON_TEST_CONFIG ??
        fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
      vars: {
        CRON_CONTROL_ENABLED_JOBS: 'tasks-cleanup-media',
        TASKS_ORIGIN: `http://127.0.0.1:${port}`,
      },
      secrets: {
        CRON_CONTROL_DELIVERY_TOKEN: randomUUID() + randomUUID(),
        CRON_CONTROL_OPERATOR_TOKEN: operatorToken,
        CRON_SECRET_TASKS: cronSecret,
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
  await new Promise((resolve) => processor.close(resolve));
});

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-23T03:17:00.000Z');
const worker = () => harness.getWorker();
const control = (path, method = 'GET') =>
  harness.fetch(path, {
    method,
    headers: { Authorization: `Bearer ${operatorToken}` },
    signal: AbortSignal.timeout(10_000),
  });
async function tick(cron, scheduledTime) {
  const result = await worker().scheduled({
    cron,
    scheduledTime: new Date(scheduledTime),
  });
  assert.equal(result.outcome, 'ok');
}
async function cleanupState() {
  const { jobs } = await (await control('/control/jobs')).json();
  return jobs.find((job) => job.id === 'tasks-cleanup-media').state;
}

test('complete private health response from the real Worker', async () => {
  const response = await harness.fetch('/health', {
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
      `Bearer ${cronSecret}`,
    ],
  ]) {
    const response = await harness.fetch(path, {
      method,
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Not found' });
  }
});

test('a disabled job performs no processor call and no ledger storage', async () => {
  await tick('0 */12 * * *', T0);
  await tick('* * * * *', T0);
  assert.equal(processorCalls.length, 0);
  assert.deepEqual(await worker().listDurableObjectIds('CronLedger'), []);
});

test('an enabled job runs once per slot, survives restart and honors stop', async () => {
  await tick('17 3 * * *', T0);
  await tick('17 3 * * *', T0 + 30_000);
  assert.equal(processorCalls.length, 1);
  assert.deepEqual(processorCalls[0], {
    authorization: `Bearer ${cronSecret}`,
    method: 'GET',
    url: '/api/cron/tasks/cleanup-media',
    userAgent: 'Tuturuuu-Cron-Control/1.0',
  });
  assert.equal((await cleanupState()).lastOutcome, 'ok');

  await worker().evictDurableObject('CronLedger', {
    name: 'cron-control-ledger',
  });
  await tick('17 3 * * *', T0);
  assert.equal(processorCalls.length, 1, 'restart keeps the slot claim');

  const stopped = await control(
    '/control/jobs/tasks-cleanup-media/stop',
    'POST'
  );
  assert.equal(stopped.status, 200);
  await tick('17 3 * * *', T0 + DAY);
  assert.equal(processorCalls.length, 1, 'stopped job is not called');

  await control('/control/jobs/tasks-cleanup-media/resume', 'POST');
  await tick('17 3 * * *', T0 + 2 * DAY);
  assert.equal(processorCalls.length, 2);
});

test('persistent processor failure exhausts the durable budget', async () => {
  processorStatus = 500;
  const before = processorCalls.length;
  for (let day = 3; day < 10; day++) await tick('17 3 * * *', T0 + day * DAY);
  assert.equal(processorCalls.length - before, 5);
  const state = await cleanupState();
  assert.equal(state.stopped, true);
  assert.equal(state.stopReason, 'failure-budget-exhausted');
  processorStatus = 200;
});
