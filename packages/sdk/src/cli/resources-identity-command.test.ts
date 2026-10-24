import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runResourcesCommand } from './resources';
import { resourceIdentityCommand } from './resources-identity-command';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./resources-process-identity', async (original) => ({
  ...(await original<typeof import('./resources-process-identity')>()),
  requireProcessIdentity: capture,
}));
const identity = {
  backend: 'linux-proc-v1',
  host: 'host',
  boot: 'boot',
  namespace: 'pid:[123]',
  birth: '12345678901234567',
};
const home = join(tmpdir(), `identity-read-only-${randomUUID()}`);
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  capture.mockReset();
  await rm(home, { recursive: true, force: true });
});
it('returns the requested kernel identity without admission or a resource-home write', async () => {
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  capture.mockReturnValue(identity);
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await runResourcesCommand(['identity', '--pid', '123', '--json']);
  expect(capture).toHaveBeenCalledExactlyOnceWith(123);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({
    pid: 123,
    ownershipVersion: 1,
    pidStart: identity,
  });
  expect(existsSync(home)).toBe(false);
});
it.each(['0', '-1', '1.5', '1e3', '2147483648', ''])(
  'rejects invalid PID %s before inspection',
  (pid) => {
    expect(() => resourceIdentityCommand(['--pid', pid])).toThrow(
      'positive system PID'
    );
    expect(capture).not.toHaveBeenCalled();
  }
);
it('rejects duplicate or command arguments and preserves unavailable inspection', () => {
  for (const args of [
    ['--pid', '1', '--pid', '2'],
    ['--json', '--json'],
    ['--', 'node'],
  ])
    expect(() => resourceIdentityCommand(args)).toThrow(
      'Use ttr resources identity'
    );
  capture.mockImplementation(() => {
    throw new Error('kernel inspection denied');
  });
  expect(() => resourceIdentityCommand([])).toThrow('kernel inspection denied');
});
