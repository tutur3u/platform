import { expect, it, vi } from 'vitest';
import { collectSyntheticContainerLogs } from './devbox-playground-runtime-diagnostics';

it('collects bounded PID 1 logs without exec, configuration or environment', async () => {
  const docker = vi.fn().mockResolvedValue({
    code: 0,
    timedOut: false,
    exceeded: false,
    output: '\u001b[31mstartup failed\u001b[0m',
    stderr: '\u001b[33mruntime failed\u001b[0m',
  });
  const logs = await collectSyntheticContainerLogs('a'.repeat(64), docker);
  expect(docker).toHaveBeenCalledExactlyOnceWith(
    ['logs', '--tail', '20', 'a'.repeat(64)],
    '',
    5000,
    2048
  );
  expect(logs).toEqual({
    code: 0,
    timedOut: false,
    exceeded: false,
    output: 'startup failed',
    stderr: 'runtime failed',
  });
});

it('rejects malformed container identities before issuing Docker commands', async () => {
  const docker = vi.fn();
  await expect(collectSyntheticContainerLogs('--all', docker)).rejects.toThrow(
    'Invalid owned container ID'
  );
  expect(docker).not.toHaveBeenCalled();
});

it('retains collection failures and bounds even oversized injected output', async () => {
  const docker = vi.fn().mockResolvedValue({
    code: 1,
    timedOut: true,
    exceeded: true,
    output: 'x'.repeat(5000),
    stderr: 'y'.repeat(5000),
  });
  const logs = await collectSyntheticContainerLogs('a'.repeat(12), docker);
  expect(logs.code).toBe(1);
  expect(logs.timedOut).toBe(true);
  expect(logs.exceeded).toBe(true);
  expect(logs.output).toHaveLength(2048);
  expect(logs.stderr).toHaveLength(2048);
});
