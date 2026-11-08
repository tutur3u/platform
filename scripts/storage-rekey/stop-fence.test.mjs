import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStopFence, StopRequested } from './stop-fence.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekey-stop-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('STOP file halts the next operation and survives a new fence (restart)', (t) => {
  const stopFile = path.join(tempDir(t), 'STOP');
  const fence = createStopFence({ stopFile, maxOps: 10 });
  fence.beforeOperation();
  fs.writeFileSync(stopFile, '');
  assert.throws(
    () => fence.beforeOperation(),
    (error) => error instanceof StopRequested && error.reason === 'stop_file'
  );
  assert.equal(fence.used, 1, 'a fenced operation is not counted');
  const restarted = createStopFence({ stopFile, maxOps: 10 });
  assert.throws(() => restarted.beforeOperation(), { reason: 'stop_file' });
  fs.rmSync(stopFile);
  restarted.beforeOperation();
  assert.equal(restarted.used, 1);
});

test('max-ops cap is a hard budget', (t) => {
  const fence = createStopFence({
    stopFile: path.join(tempDir(t), 'STOP'),
    maxOps: 2,
  });
  fence.beforeOperation();
  fence.beforeOperation();
  assert.equal(fence.remaining, 0);
  assert.throws(() => fence.beforeOperation(), { reason: 'max_ops' });
});

test('fence requires a stop file and a positive budget', () => {
  assert.throws(() => createStopFence({ maxOps: 1 }));
  assert.throws(() => createStopFence({ stopFile: '/tmp/x', maxOps: 0 }));
});
