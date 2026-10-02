import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { docker } = vi.hoisted(() => ({ docker: vi.fn() }));
vi.mock('./devbox-sandbox-process', () => ({ sandboxDocker: docker }));
vi.mock('./devbox-judge-sandbox', () => ({
  createJudgeDockerArgs: ({ image }: { image: string }) => ['run', image],
  readJudgeDockerCapacity: vi.fn().mockResolvedValue({
    hostCpus: 4,
    hostMemoryBytes: 8 * 1024 ** 3,
  }),
}));
const limits = {
  max_cpu_percent: 50,
  max_memory_percent: 25,
  max_sandboxes: 1,
  max_instances: 1,
  sandbox_memory_mb: 256,
  sandbox_timeout_seconds: 10,
  sandbox_pids: 64,
};
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const name = `ttr-playground-fixture-${first}`;
function payload(projectId = first, operation = 'run') {
  return Buffer.from(
    JSON.stringify({
      projectId,
      operation,
      revision: 0,
      language: 'python',
      ...(operation === 'run' ? { files: [], command: 'true' } : {}),
    })
  ).toString('base64url');
}
function result(code = 0, output = '') {
  return { code, output, stderr: '', exceeded: false, timedOut: false };
}
describe('managed playground removal ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    docker.mockReset();
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', 'fixture');
    vi.stubEnv(
      'TUTURUUU_PLAYGROUND_IMAGES',
      JSON.stringify({ python: `python@sha256:${'a'.repeat(64)}` })
    );
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'inspect') return result(0, 'true');
      if (args[0] === 'exec' && args.includes('name')) return result(0, '[]');
      // The final export invokes Python without --interactive.
      if (args[0] === 'exec' && !args.includes('--interactive'))
        return result(0, '[]');
      return result();
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('keeps capacity owned when removal fails and the container remains', async () => {
    const { runPlaygroundJob, playgroundEnvironmentCount } = await import(
      './devbox-playground-sandbox'
    );
    await runPlaygroundJob(payload(), limits);
    docker.mockImplementation(async (args: string[]) => {
      if (args[0] === 'rm') return result(1);
      if (args[0] === 'ps') return result(0, 'abcdef012345');
      return result();
    });
    await expect(
      runPlaygroundJob(payload(first, 'stop'), limits)
    ).rejects.toThrow('Could not remove');
    expect(playgroundEnvironmentCount()).toBe(1);
    await expect(runPlaygroundJob(payload(second), limits)).rejects.toThrow(
      'at capacity'
    );
    expect(docker).toHaveBeenCalledWith([
      'ps',
      '-aq',
      '--filter',
      `name=^/${name}$`,
    ]);
  });

  it('does not release capacity when Docker inventory is unavailable', async () => {
    const { runPlaygroundJob, playgroundEnvironmentCount } = await import(
      './devbox-playground-sandbox'
    );
    await runPlaygroundJob(payload(), limits);
    docker.mockResolvedValue(result(1));
    await expect(
      runPlaygroundJob(payload(first, 'stop'), limits)
    ).rejects.toThrow('Could not remove');
    expect(playgroundEnvironmentCount()).toBe(1);
  });

  it('releases capacity after healthy inventory confirms an already absent container', async () => {
    const { runPlaygroundJob, playgroundEnvironmentCount } = await import(
      './devbox-playground-sandbox'
    );
    await runPlaygroundJob(payload(), limits);
    docker.mockImplementation(async (args: string[]) =>
      result(args[0] === 'rm' ? 1 : 0)
    );
    await runPlaygroundJob(payload(first, 'stop'), limits);
    expect(playgroundEnvironmentCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start new sandboxes if orphan removal cannot be verified', async () => {
    const { runPlaygroundJob } = await import('./devbox-playground-sandbox');
    docker.mockImplementation(async (args: string[]) =>
      result(args[0] === 'rm' ? 1 : 0, args[0] === 'ps' ? 'abcdef012345' : '')
    );
    await expect(runPlaygroundJob(payload(), limits)).rejects.toThrow(
      'Could not remove'
    );
    expect(docker.mock.calls.some(([args]) => args[0] === 'run')).toBe(false);
    expect(docker).toHaveBeenCalledWith([
      'ps',
      '-aq',
      '--filter',
      'id=abcdef012345',
    ]);
  });

  it('requires a configured pool owner even for stop operations', async () => {
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', '');
    const { runPlaygroundJob } = await import('./devbox-playground-sandbox');
    await expect(
      runPlaygroundJob(payload(first, 'stop'), limits)
    ).rejects.toThrow('pool identity');
    expect(docker).not.toHaveBeenCalled();
  });
});
