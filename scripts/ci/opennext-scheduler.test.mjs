import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const originalSetImmediate = globalThis.setImmediate;
const { runInSequentialTasks } =
  await import('../../apps/web/node_modules/@opennextjs/cloudflare/dist/cli/build/w3-scheduler.mjs');

after(() => {
  globalThis.setImmediate = originalSetImmediate;
});

const TIMEOUT_MS = 30_000;
const timeoutError = { message: 'OpenNext global scheduler task timed out' };

test('drops expired waiters and lets a fresh task run', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = t.mock.fn(() => 'stale');
  const first = runInSequentialTasks(stage);
  const second = runInSequentialTasks(stage);
  const rejected = Promise.all([
    assert.rejects(first, timeoutError),
    assert.rejects(second, timeoutError),
  ]);

  t.mock.timers.tick(TIMEOUT_MS - 1);
  let settled = false;
  void rejected.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  t.mock.timers.tick(1);
  await rejected;
  assert.equal(await runInSequentialTasks(() => 'fresh'), 'fresh');
  assert.equal(stage.mock.callCount(), 0);
});

test('rejects a started task whose result stays pending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = Promise.withResolvers();
  const task = runInSequentialTasks(() => result.promise);
  const rejected = assert.rejects(task, timeoutError);

  assert.equal(await runInSequentialTasks(() => 'next stage'), 'next stage');
  t.mock.timers.tick(TIMEOUT_MS);
  await rejected;
  result.reject(new Error('late rejection'));
  assert.equal(await runInSequentialTasks(() => 'next'), 'next');
});

test('stops later stages when the running task hits its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = Promise.withResolvers();
  const lateStage = t.mock.fn();
  const task = runInSequentialTasks(() => started.resolve(), lateStage);
  const rejected = assert.rejects(task, timeoutError);

  await started.promise;
  t.mock.timers.tick(TIMEOUT_MS);
  await rejected;
  assert.equal(await runInSequentialTasks(() => 'next'), 'next');
  assert.equal(lateStage.mock.callCount(), 0);
});

test('preserves stage order and successful results before the deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const order = [];
  const task = runInSequentialTasks(
    () => {
      order.push('first');
      return Promise.resolve('result');
    },
    () => order.push('second')
  );
  const next = runInSequentialTasks(() => order.push('next'));

  assert.equal(await task, 'result');
  await next;
  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(order, ['first', 'second', 'next']);
});
