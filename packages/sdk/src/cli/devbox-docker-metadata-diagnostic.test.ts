import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { dockerMetadata } from './devbox-docker-metadata';
import { metadataDiagnostic } from './devbox-docker-metadata-diagnostic';

const secret = 'SECRET-host-token-path-context-metadata';
let now = 0;
const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
beforeEach(() => {
  now = 0;
  sink.mockClear();
  vi.stubEnv('CI', 'true');
  vi.stubEnv('TTR_DOCKER_METADATA_DIAGNOSTIC', '1');
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.mocked(performance.now).mockRestore();
  spawn.mockReset();
});
function child() {
  const process = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill: vi.fn(() => true),
  });
  spawn.mockReturnValue(process);
  return process;
}
function receipt() {
  expect(sink).toHaveBeenCalledTimes(1);
  const line = sink.mock.calls[0]?.[0];
  expect(typeof line).toBe('string');
  expect(Buffer.byteLength(line)).toBeLessThan(1024);
  expect(line).not.toContain(secret);
  const parsed = JSON.parse(line);
  expect(Object.keys(parsed)).toEqual([
    'schema',
    'ordinal',
    'runtime',
    'nodeVersion',
    'bunVersion',
    'elapsedMs',
    'spawnMs',
    'firstStdoutMs',
    'firstStdoutBytes',
    'stdoutBytes',
    'errorMs',
    'exitMs',
    'closeMs',
    'deadlineMs',
    'callbackLatenessMs',
    'killResult',
    'spawnFailure',
    'exitCode',
    'signal',
  ]);
  return parsed;
}

test.each([
  ['true', undefined],
  ['false', '1'],
  [undefined, '1'],
  ['true', 'true'],
])('default and non-CI invocations emit nothing (%s/%s)', async (ci, optIn) => {
  vi.stubEnv('CI', ci);
  vi.stubEnv('TTR_DOCKER_METADATA_DIAGNOSTIC', optIn);
  const process = child();
  const result = dockerMetadata([secret], 4000, secret);
  process.emit('exit', 0, null);
  await result;
  expect(sink).not.toHaveBeenCalled();
  expect(process.listenerCount('spawn')).toBe(0);
  expect(process.listenerCount('close')).toBe(0);
});

test('one fixed record preserves event timing, ordinal, output cap and drain', async () => {
  const process = child();
  const result = dockerMetadata([secret], 4000, secret);
  now = 1;
  process.emit('spawn');
  now = 2;
  process.stdout.emit('data', Buffer.from('é'));
  now = 3;
  process.stdout.emit('data', secret.repeat(3000));
  now = 4;
  process.emit('exit', 0, null);
  now = 5;
  process.emit('close', 0, null);
  const value = await result;
  expect(value.output).toHaveLength(65536);
  expect(value.code).toBe(0);
  expect(receipt()).toMatchObject({
    spawnMs: 1,
    firstStdoutMs: 2,
    firstStdoutBytes: 2,
    stdoutBytes: 2 + Buffer.byteLength(secret.repeat(3000)),
    exitMs: 4,
    closeMs: 5,
    elapsedMs: 5,
    deadlineMs: null,
    exitCode: 0,
    signal: null,
  });
  const first = receipt().ordinal;
  process.emit('close');
  process.stdout.emit('data', secret);
  expect(sink).toHaveBeenCalledTimes(1);
  expect(process.listenerCount('close')).toBe(0);
  expect(process.stdout.listenerCount('data')).toBe(1);
  sink.mockClear();
  const next = child();
  const second = dockerMetadata([]);
  next.emit('exit', 0, null);
  await second;
  expect(receipt().ordinal).toBe(first + 1);
});

test.each([true, false])(
  'deadline records lateness and kill=%s without retry',
  async (killed) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const process = child();
    process.kill.mockReturnValue(killed);
    const result = dockerMetadata([]);
    now = 4025;
    await vi.advanceTimersByTimeAsync(4000);
    expect(sink).not.toHaveBeenCalled();
    expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    now = 4030;
    process.emit('exit', null, 'SIGKILL');
    expect((await result).timedOut).toBe(true);
    expect(receipt()).toMatchObject({
      deadlineMs: 4025,
      callbackLatenessMs: 25,
      killResult: killed,
      exitMs: 4030,
      closeMs: null,
      signal: 'SIGKILL',
      exitCode: null,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

test.each(['ENOENT', 'EACCES', secret])(
  'async error %s is classified without text',
  async (code) => {
    const process = child();
    const result = dockerMetadata([secret]);
    now = 7;
    process.emit('error', Object.assign(new Error(secret), { code }));
    await result;
    expect(receipt()).toMatchObject({
      errorMs: 7,
      exitMs: null,
      closeMs: null,
      spawnFailure:
        code === 'ENOENT'
          ? 'not-found'
          : code === 'EACCES'
            ? 'permission-denied'
            : 'other',
    });
    process.emit('exit', 2, secret);
    process.emit('close');
    expect(sink).toHaveBeenCalledTimes(1);
  }
);

test('synchronous error settles once without installing timers', async () => {
  spawn.mockImplementationOnce(() => {
    throw new Error(secret);
  });
  expect((await dockerMetadata([secret])).code).toBe(1);
  expect(receipt()).toMatchObject({
    spawnMs: null,
    errorMs: 0,
    spawnFailure: 'other',
  });
});

test('exit settles without waiting for close, redacts signals and survives sink failure', async () => {
  const process = child();
  const result = dockerMetadata([]);
  process.emit('exit', 17, secret);
  expect((await result).code).toBe(1);
  expect(receipt()).toMatchObject({
    exitCode: 17,
    signal: 'other',
    closeMs: null,
  });
  sink.mockImplementationOnce(() => {
    throw new Error(secret);
  });
  const next = child();
  const second = dockerMetadata([]);
  next.emit('exit', 0, null);
  expect((await second).code).toBe(0);
});

test('finite numeric bounds and single settlement constrain malformed lifecycle values', () => {
  const diagnostic = metadataDiagnostic();
  diagnostic?.stdout(Buffer.from('x'));
  diagnostic?.exit(Number.NaN, secret);
  now = Number.POSITIVE_INFINITY;
  diagnostic?.settle();
  diagnostic?.settle();
  expect(receipt()).toMatchObject({
    elapsedMs: 2147483647,
    exitCode: null,
    signal: 'other',
  });
});
