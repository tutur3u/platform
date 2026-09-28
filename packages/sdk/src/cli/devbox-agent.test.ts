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
});
