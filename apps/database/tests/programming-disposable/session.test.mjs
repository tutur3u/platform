import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { boundedSession } from './session.mjs';

function child() {
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  process.stdin = new EventEmitter();
  process.stdin.end = () => {};
  process.signals = [];
  process.kill = (signal) => {
    process.signals.push(signal);
  };
  return process;
}
test('never-closing client rejects readiness and completion, then escalates', async () => {
  const process = child();
  const session = boundedSession(process, '', 10, 5);
  await assert.rejects(session.locked, /deadline exceeded/);
  await assert.rejects(session.done, /deadline exceeded/);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(process.signals, ['SIGTERM', 'SIGKILL']);
});
test('deadline still bounds completion after lock marker', async () => {
  const process = child();
  const session = boundedSession(process, '', 10, 5);
  process.stdout.emit('data', 'FIXTURE_LOCKED');
  await session.locked;
  await assert.rejects(session.done, /deadline exceeded/);
  process.emit('close', 143);
});
test('successful close clears termination timer and preserves outputs', async () => {
  const process = child();
  const session = boundedSession(process, '', 10, 5);
  process.stdout.emit('data', 'FIXTURE_LOCKED');
  process.stderr.emit('data', 'synthetic error');
  process.emit('close', 0);
  await session.locked;
  assert.deepEqual(await session.done, {
    code: 0,
    output: 'FIXTURE_LOCKED',
    errors: 'synthetic error',
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(process.signals, []);
});
test('early close without lock marker fails readiness rather than faking lock', async () => {
  const process = child();
  const session = boundedSession(process, '', 100);
  process.emit('close', 1);
  await assert.rejects(session.locked, /before acquiring lock/);
  assert.equal((await session.done).code, 1);
});
test('real early stdin closure rejects through caller finally instead of uncaught EPIPE', async () => {
  const process = spawn(
    globalThis.process.execPath,
    [
      '-e',
      "require('node:fs').closeSync(0);process.stdout.write('READY');setTimeout(()=>{},2000)",
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  await new Promise((resolve, reject) => {
    process.stdout.once('data', resolve);
    process.once('error', reject);
  });
  const session = boundedSession(process, 'synthetic payload', 500, 10);
  let cleanupReached = false;
  try {
    await assert.rejects(session.done, /Fixture session input failed/);
  } finally {
    cleanupReached = true;
  }
  assert.equal(cleanupReached, true);
  await assert.rejects(session.locked, /Fixture session input failed/);
});
