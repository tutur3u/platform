import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import {
  dockerMetadata,
  dockerMetadataFailure,
} from './devbox-docker-metadata';
import { readJudgeDockerCapacity } from './devbox-judge-sandbox';

const capacity = {
  NCPU: 4,
  MemTotal: 8_000_000_000,
  Runtimes: { runsc: {} },
  CgroupDriver: 'systemd',
  SecurityOptions: [],
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function child() {
  const process = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill: vi.fn(),
  });
  spawn.mockReturnValue(process);
  return process;
}
function reply(info: unknown, code = 0, signal: string | null = null) {
  const process = child();
  queueMicrotask(() => {
    process.stdout.emit('data', JSON.stringify(info));
    process.emit('exit', code, signal);
  });
  return process;
}

test('four-second timeout kills once and remains a strict capacity failure', async () => {
  vi.useFakeTimers();
  const process = child();
  process.kill.mockImplementation(() => {
    process.emit('exit', null, 'SIGKILL');
    return true;
  });
  const result = readJudgeDockerCapacity();
  const rejected = expect(result).rejects.toThrow(
    'metadata timeout after 4000ms'
  );
  await vi.advanceTimersByTimeAsync(3999);
  expect(process.kill).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(process.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  expect(spawn).toHaveBeenCalledTimes(1);
});

test('nonzero exit diagnostic excludes Docker host and output', async () => {
  reply('private-output-do-not-log', 17);
  await expect(
    readJudgeDockerCapacity('private-host-do-not-log')
  ).rejects.toThrow(
    'Docker engine is unavailable for Judge (metadata exit 17).'
  );
  expect(spawn).toHaveBeenCalledWith(
    'docker',
    ['--host', 'private-host-do-not-log', 'info', '--format', '{{json .}}'],
    { shell: false, stdio: ['ignore', 'pipe', 'ignore'] }
  );
});

test.each(['ENOENT', 'EACCES', 'OTHER'])(
  'spawn %s reports a fixed classification without the raw error',
  async (code) => {
    const process = child();
    queueMicrotask(() =>
      process.emit(
        'error',
        Object.assign(new Error('private-host-and-token-do-not-log'), { code })
      )
    );
    await expect(readJudgeDockerCapacity()).rejects.toThrow(
      `metadata spawn ${code === 'ENOENT' ? 'not-found' : code === 'EACCES' ? 'permission-denied' : 'other'}`
    );
  }
);

test('synchronous spawn error is safe and unavailable', async () => {
  spawn.mockImplementationOnce(() => {
    throw Object.assign(new Error('private-do-not-log'), { code: 'ENOENT' });
  });
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'metadata spawn not-found'
  );
});

test('signal is distinct from null exit and cannot masquerade as success', async () => {
  reply(capacity, 0, 'SIGTERM');
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'metadata signal SIGTERM'
  );
  const process = child();
  const result = dockerMetadata(['info']);
  process.emit('exit', null, null);
  expect(dockerMetadataFailure(await result)).toBe('metadata exit unavailable');
});

test('valid metadata succeeds while gVisor and cgroup requirements remain enforced', async () => {
  reply(capacity);
  await expect(readJudgeDockerCapacity()).resolves.toEqual({
    hostCpus: 4,
    hostMemoryBytes: 8_000_000_000,
  });
  reply({ ...capacity, Runtimes: {} });
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'registered gVisor runsc runtime'
  );
  reply({ ...capacity, CgroupDriver: 'none' });
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'enforced Docker cgroup resource limits'
  );
  reply({ ...capacity, SecurityOptions: ['rootless'] });
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'enforced Docker cgroup resource limits'
  );
  reply({ ...capacity, NCPU: 0 });
  await expect(readJudgeDockerCapacity()).rejects.toThrow(
    'did not report Judge host capacity'
  );
});
