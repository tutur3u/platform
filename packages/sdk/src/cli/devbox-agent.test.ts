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
});
