const assert = require('node:assert/strict');
const test = require('node:test');
const {
  HEARTBEAT_INTERVAL_MS,
  startRuntimeHeartbeat,
  withRuntimeHeartbeat,
  runPlaywrightWithHeartbeat,
} = require('./e2e-runtime-heartbeat');

function capture(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
  let monotonic = 100;
  let cpu = 1000;
  t.mock.method(performance, 'now', () => {
    monotonic += 10_000;
    return monotonic;
  });
  t.mock.method(process, 'cpuUsage', () => {
    cpu += 2000;
    return { user: cpu, system: 0 };
  });
  return t.mock.method(console, 'info', () => {}).mock;
}

test('heartbeat emits numeric deltas only and stops without leaking timers', (t) => {
  const logs = capture(t);
  const stop = startRuntimeHeartbeat('worker', {
    CI: 'true',
    PRIVATE_TOKEN: 'private-test-value',
  });
  t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
  assert.deepEqual(logs.calls[0].arguments, [
    '[e2e-heartbeat] worker',
    {
      wallDeltaMs: 10_000,
      monotonicDeltaMs: 10_000,
      cpuDeltaMs: 2,
    },
  ]);
  stop();
  stop();
  t.mock.timers.tick(HEARTBEAT_INTERVAL_MS * 2);
  assert.equal(logs.callCount(), 1);
});

test('ordinary local execution has no heartbeat and rejects arbitrary role labels', (t) => {
  const logs = capture(t);
  const stop = startRuntimeHeartbeat('worker', { CI: 'false' });
  t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
  stop();
  assert.equal(logs.callCount(), 0);
  assert.throws(
    () => startRuntimeHeartbeat('private-test-value', { CI: 'true' }),
    /Invalid E2E diagnostic role/
  );
});

test('wrapper clears heartbeat after success and failure, retaining original outcomes', async (t) => {
  const logs = capture(t);
  assert.equal(
    await withRuntimeHeartbeat(
      'runner',
      async () => {
        t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
        return 'synthetic-result';
      },
      { E2E_RUNTIME_DIAGNOSTICS: 'true' }
    ),
    'synthetic-result'
  );
  const failure = new Error('private-test-failure');
  await assert.rejects(
    withRuntimeHeartbeat(
      'runner',
      async () => {
        t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
        throw failure;
      },
      { CI: 'true' }
    ),
    (error) => error === failure
  );
  t.mock.timers.tick(HEARTBEAT_INTERVAL_MS * 2);
  assert.equal(logs.callCount(), 2);
  assert.equal(JSON.stringify(logs.calls).includes('private-test'), false);
});

test('runner integration preserves Playwright command and environment', async (t) => {
  const logs = capture(t);
  const options = { cwd: '/synthetic', env: { CI: 'true' } };
  const command = t.mock.fn(async (...args) => {
    assert.deepEqual(args, [
      'bunx',
      ['playwright', 'test', '--shard=1/4'],
      options,
    ]);
    t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
  });
  await runPlaywrightWithHeartbeat(command, ['--shard=1/4'], options);
  t.mock.timers.tick(HEARTBEAT_INTERVAL_MS);
  assert.equal(command.mock.callCount(), 1);
  assert.equal(logs.callCount(), 1);
});
