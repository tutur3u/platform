const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { runCheck } = require('./check-mobile.js');

function createMockProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

test('runCheck buffers successful output by default', async () => {
  const proc = createMockProc();
  const stdoutWrites = [];
  const stderrWrites = [];

  const resultPromise = runCheck(
    {
      name: 'flutter-test',
      command: 'turbo',
      args: ['run', 'flutter-test'],
      parseOutput: () => 'All tests passed',
    },
    {
      spawnImpl: () => proc,
      stdoutWriter: (str) => stdoutWrites.push(str),
      stderrWriter: (str) => stderrWrites.push(str),
    }
  );

  proc.stdout.emit('data', Buffer.from('success output\n'));
  proc.stderr.emit('data', Buffer.from('warning output\n'));
  proc.emit('close', 0);

  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(stdoutWrites, []);
  assert.deepEqual(stderrWrites, []);
});

test('runCheck prints buffered output when a check fails', async () => {
  const proc = createMockProc();
  const stdoutWrites = [];
  const stderrWrites = [];

  const resultPromise = runCheck(
    {
      name: 'flutter-analyze',
      command: 'turbo',
      args: ['run', 'flutter-analyze'],
      parseOutput: () => 'Passed',
    },
    {
      spawnImpl: () => proc,
      stdoutWriter: (str) => stdoutWrites.push(str),
      stderrWriter: (str) => stderrWrites.push(str),
    }
  );

  proc.stdout.emit('data', Buffer.from('analysis failed\n'));
  proc.stderr.emit('data', Buffer.from('stacktrace\n'));
  proc.emit('close', 1);

  const result = await resultPromise;

  assert.equal(result.success, false);
  assert.deepEqual(stdoutWrites, []);
  assert.deepEqual(stderrWrites, ['analysis failed\nstacktrace\n']);
});
