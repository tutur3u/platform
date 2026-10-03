import { expect, it, vi } from 'vitest';
import {
  collectSyntheticContainerLogs,
  syntheticContainerLoggingArgs,
  syntheticContainerStartFailure,
} from './devbox-playground-runtime-diagnostics';

it('enables bounded readable logs only for opted-in synthetic CI identities', () => {
  expect(syntheticContainerLoggingArgs('ci-123-1', true)).toEqual([
    '--log-driver=local',
    '--log-opt=max-size=8k',
    '--log-opt=max-file=1',
  ]);
  expect(syntheticContainerLoggingArgs('ci-123-1', false)).toEqual([]);
  expect(syntheticContainerLoggingArgs('production', true)).toEqual([]);
  expect(syntheticContainerLoggingArgs('ci-', true)).toEqual([]);
});

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

it('retains sanitized bounded create failure only in opted-in synthetic pools', () => {
  const failure = {
    code: 125,
    timedOut: false,
    exceeded: true,
    stderr: `\u001b[31mDocker refused option\u001b[0m${'x'.repeat(3000)}`,
  };
  expect(
    syntheticContainerStartFailure('production', true, failure)
  ).toBeNull();
  expect(syntheticContainerStartFailure('ci-123-1', false, failure)).toBeNull();
  expect(
    syntheticContainerStartFailure('ci-123-1-extra', true, failure)
  ).toBeNull();
  const diagnostic = syntheticContainerStartFailure('ci-123-1', true, failure)!;
  expect(diagnostic).toEqual({
    code: 125,
    timedOut: false,
    exceeded: true,
    stderr: `Docker refused option${'x'.repeat(3000)}`.slice(0, 2048),
  });
  expect(Object.keys(diagnostic)).toEqual([
    'code',
    'timedOut',
    'exceeded',
    'stderr',
  ]);
});
