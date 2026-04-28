const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const { checks, resolvePubCache, runCheck } = require('./check-mobile.js');

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
      name: 'flutter-analyze',
      command: 'turbo',
      args: ['run', 'flutter-analyze'],
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

test('runCheck streams flutter-test output by default', async () => {
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

  proc.stdout.emit('data', Buffer.from('00:01 +10: still running\n'));
  proc.emit('close', 0);

  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(stdoutWrites, ['00:01 +10: still running\n']);
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

test('mobile checks invoke turbo through bun', () => {
  assert.equal(checks[0].command, 'bun');
  assert.deepEqual(checks[0].args.slice(0, 2), ['x', 'turbo']);
});

test('resolvePubCache prefers explicit PUB_CACHE', () => {
  const value = resolvePubCache({ PUB_CACHE: 'C:/custom/pub-cache' });
  assert.equal(value, 'C:/custom/pub-cache');
});

test('resolvePubCache derives Windows fallback cache path', () => {
  const value = resolvePubCache(
    {
      LOCALAPPDATA: 'C:/Users/Test/AppData/Local',
    },
    {
      platform: 'win32',
      homeDir: 'C:/Users/Test',
    }
  );
  assert.equal(value, path.join('C:/Users/Test/AppData/Local', 'Pub', 'Cache'));
});

test('resolvePubCache derives macOS fallback cache path', () => {
  const value = resolvePubCache(
    {},
    {
      platform: 'darwin',
      homeDir: '/Users/Test',
    }
  );

  assert.equal(value, path.join('/Users/Test', '.pub-cache'));
});
