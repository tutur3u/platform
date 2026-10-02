import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { sandboxDocker } from './devbox-sandbox-process';

afterEach(() => vi.unstubAllEnvs());
it('preserves trusted Docker daemon selection without forwarding unrelated host secrets', async () => {
  vi.stubEnv('DOCKER_HOST', 'unix:///tmp/fixture-docker.sock');
  vi.stubEnv('DOCKER_CONTEXT', 'fixture');
  vi.stubEnv('DOCKER_CONFIG', '/tmp/fixture-docker-config');
  vi.stubEnv('DOCKER_CERT_PATH', '/tmp/fixture-cert');
  vi.stubEnv('DOCKER_TLS_VERIFY', '1');
  vi.stubEnv('SYNTHETIC_UNRELATED_TOKEN', 'not-for-docker');
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      kill: vi.fn(),
    });
    queueMicrotask(() => child.emit('close', 0));
    return child;
  });
  await sandboxDocker(['info']);
  const options = spawn.mock.calls[0]![2];
  expect(options.env).toMatchObject({
    DOCKER_HOST: 'unix:///tmp/fixture-docker.sock',
    DOCKER_CONTEXT: 'fixture',
    DOCKER_CONFIG: '/tmp/fixture-docker-config',
    DOCKER_CERT_PATH: '/tmp/fixture-cert',
    DOCKER_TLS_VERIFY: '1',
  });
  expect(options.env).not.toHaveProperty('SYNTHETIC_UNRELATED_TOKEN');
  expect(spawn.mock.calls[0]![1]).toEqual(['info']);
});
