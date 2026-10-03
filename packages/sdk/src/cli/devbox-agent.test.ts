import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { executeJob, pollJobs } = vi.hoisted(() => ({
  executeJob: vi.fn(),
  pollJobs: vi.fn(),
}));

vi.mock('../platform-devbox', () => ({ pollDevboxAgentJobs: pollJobs }));
vi.mock('./devbox-runner', () => ({ executeDevboxAgentJob: executeJob }));
vi.mock('./devbox-agent-capabilities', () => ({
  createDevboxAgentCapabilities: vi
    .fn()
    .mockResolvedValue({ cli: { version: '1.0' } }),
}));

import { runDevboxAgentLoop } from './devbox-agent';

describe('Devbox agent upgrade handoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    executeJob.mockReset();
    pollJobs.mockReset();
    vi.stubEnv('TUTURUUU_DEVBOX_CONTROL_URL', '');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('routes heartbeat and claims to the configured Cloudflare control plane', async () => {
    vi.stubEnv('TUTURUUU_DEVBOX_CONTROL_URL', 'https://control.example.test');
    pollJobs.mockResolvedValue({ jobs: [], ok: true });

    await runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      once: true,
      token: 'runner-token',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('https://control.example.test/v1/heartbeat'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(pollJobs).toHaveBeenCalledWith({
      baseUrl: 'https://control.example.test',
      path: '/v1/poll',
      token: 'runner-token',
    });
  });

  it('exits after a successful CLI update so the service manager restarts it', async () => {
    pollJobs.mockResolvedValue({
      jobs: [
        {
          command: ['bun', 'i', '-g', 'tuturuuu'],
          leaseId: 'lease-1',
          runId: 'run-1',
        },
      ],
      ok: true,
    });
    executeJob.mockResolvedValue({ exitCode: 0, status: 'succeeded' });

    await runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      token: 'runner-token',
    });

    expect(pollJobs).toHaveBeenCalledTimes(1);
    expect(executeJob).toHaveBeenCalledTimes(1);
    expect(process.stdout.write).toHaveBeenCalledWith(
      'Devbox CLI updated. Exiting for service manager restart.\n'
    );
  });

  it('exits after a typed restart maintenance job', async () => {
    pollJobs.mockResolvedValue({
      jobs: [
        {
          command: ['__ttr_restart_agent_v1__'],
          leaseId: 'lease-1',
          runId: 'run-2',
        },
      ],
      ok: true,
    });
    executeJob.mockResolvedValue({ exitCode: 0, status: 'succeeded' });

    await runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      token: 'runner-token',
    });

    expect(pollJobs).toHaveBeenCalledTimes(1);
    expect(process.stdout.write).toHaveBeenCalledWith(
      'Restart requested. Exiting for service manager restart.\n'
    );
  });
  it('starts independent jobs together and drains them before maintenance', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    executeJob.mockImplementation(async (job: { runId: string }) => {
      started.push(job.runId);
      if (job.runId !== 'maintenance') await pending;
      return { exitCode: 0, status: 'succeeded' };
    });
    pollJobs.mockResolvedValue({
      ok: true,
      jobs: [
        { runId: 'first', command: ['echo', 'first'] },
        { runId: 'second', command: ['echo', 'second'] },
        { runId: 'maintenance', command: ['__ttr_restart_agent_v1__'] },
      ],
    });
    const loop = runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      once: true,
      token: 'fixture',
    });
    await vi.waitFor(() => expect(started).toEqual(['first', 'second']));
    release();
    await loop;
    expect(started).toEqual(['first', 'second', 'maintenance']);
  });
  it.each([
    ['__ttr_restart_agent_v1__', 'extra'],
    ['bun i', '-g', 'tuturuuu'],
  ])(
    'does not serialize malformed maintenance envelopes: %j',
    async (...command) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started: string[] = [];
      executeJob.mockImplementation(async (job: { runId: string }) => {
        started.push(job.runId);
        await pending;
        return { exitCode: 0, status: 'succeeded' };
      });
      pollJobs.mockResolvedValue({
        ok: true,
        jobs: [
          { runId: 'ordinary', command: ['echo'] },
          { runId: 'malformed', command },
          { runId: 'next', command: ['echo'] },
        ],
      });
      const loop = runDevboxAgentLoop({
        baseUrl: 'https://example.test',
        once: true,
        token: 'fixture',
      });
      try {
        await vi.waitFor(() =>
          expect(started).toEqual(['ordinary', 'malformed', 'next'])
        );
      } finally {
        release();
        await loop;
      }
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        'Restart requested. Exiting for service manager restart.\n'
      );
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        'Devbox CLI updated. Exiting for service manager restart.\n'
      );
    }
  );
  it('does not dispatch newly claimed jobs after an in-flight execution failure', async () => {
    let rejectJob!: (error: Error) => void;
    const execution = new Promise<never>((_, reject) => {
      rejectJob = reject;
    });
    let resolvePoll!: (result: unknown) => void;
    pollJobs.mockResolvedValueOnce({
      ok: true,
      jobs: [{ runId: 'first', command: ['echo'] }],
    });
    pollJobs.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        })
    );
    executeJob.mockReturnValue(execution);
    const loop = runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      token: 'fixture',
    });
    const outcome = expect(loop).rejects.toThrow('synthetic execution failure');
    await vi.waitFor(() => expect(pollJobs).toHaveBeenCalledTimes(2));
    rejectJob(new Error('synthetic execution failure'));
    // Allow the execution catch/finally to settle while the second claim remains pending.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    resolvePoll({ ok: true, jobs: [{ runId: 'second', command: ['echo'] }] });
    await outcome;
    expect(executeJob).toHaveBeenCalledTimes(1);
  });
  it('bounds a multi-job claim at eight active jobs without leaving heartbeat timers behind', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximum = 0;
    let started = 0;
    executeJob.mockImplementation(async () => {
      started++;
      active++;
      maximum = Math.max(maximum, active);
      await pending;
      active--;
      return { exitCode: 0, status: 'succeeded' };
    });
    pollJobs.mockResolvedValue({
      ok: true,
      jobs: Array.from({ length: 12 }, (_, index) => ({
        runId: String(index),
        command: ['echo', 'fixture'],
      })),
    });
    try {
      const loop = runDevboxAgentLoop({
        baseUrl: 'https://example.test',
        once: true,
        token: 'fixture',
      });
      await vi.waitFor(() => expect(started).toBe(8));
      await vi.advanceTimersByTimeAsync(20000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(started).toBe(8);
      release();
      await loop;
      expect(started).toBe(12);
      expect(maximum).toBe(8);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      release();
      vi.useRealTimers();
    }
  });
  it('wakes a control-plane idle wait when local execution finishes', async () => {
    vi.useFakeTimers();
    class FixtureSocket extends EventTarget {
      static CLOSED = 3;
      readyState = 1;
      close() {
        this.readyState = FixtureSocket.CLOSED;
      }
    }
    vi.stubGlobal('WebSocket', FixtureSocket);
    vi.stubEnv('TUTURUUU_DEVBOX_CONTROL_URL', 'https://control.example.test');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    executeJob.mockImplementation(async (job: { runId: string }) => {
      if (job.runId === 'first') await pending;
      return { exitCode: 0, status: 'succeeded' };
    });
    pollJobs.mockResolvedValueOnce({
      ok: true,
      jobs: [{ runId: 'first', command: ['echo'] }],
    });
    pollJobs.mockResolvedValueOnce({ ok: true, jobs: [] });
    pollJobs.mockResolvedValue({
      ok: true,
      jobs: [{ runId: 'restart', command: ['__ttr_restart_agent_v1__'] }],
    });
    const loop = runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      token: 'fixture',
    });
    try {
      await vi.waitFor(() => expect(pollJobs).toHaveBeenCalledTimes(2));
      const before = Date.now();
      release();
      await vi.waitFor(() => expect(pollJobs).toHaveBeenCalledTimes(3));
      expect(Date.now() - before).toBeLessThan(1000);
      await loop;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      release();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
  it('keeps active leases heartbeating while draining after another job fails', async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    let release!: () => void;
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    executeJob.mockImplementation(async (job: { runId: string }) => {
      if (job.runId === 'failed') await failed;
      else await pending;
      return { exitCode: 0, status: 'succeeded' };
    });
    pollJobs.mockResolvedValue({
      ok: true,
      jobs: [
        { runId: 'failed', command: ['echo'] },
        { runId: 'active', command: ['echo'] },
      ],
    });
    const loop = runDevboxAgentLoop({
      baseUrl: 'https://example.test',
      token: 'fixture',
      once: true,
    });
    const outcome = expect(loop).rejects.toThrow('synthetic failure');
    try {
      await vi.waitFor(() => expect(executeJob).toHaveBeenCalledTimes(2));
      fail(new Error('synthetic failure'));
      await vi.advanceTimersByTimeAsync(40_000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      release();
      await outcome;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      release();
      vi.useRealTimers();
    }
  });
});
