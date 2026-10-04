import { describe, expect, it, vi } from 'vitest';
import { executeDevboxAgentJob } from './devbox-runner';

describe('critical-host execution policy', () => {
  it.each([
    { command: ['sh', '-c', 'echo should-not-run'] },
    { command: ['bun', 'i', '-g', 'tuturuuu'], env: { BUN_INSTALL: '/host' } },
    { command: ['__ttr_restart_agent_v1__'], envFiles: ['/etc/private'] },
  ])(
    'rejects host execution or installer overrides before opening files or spawning',
    async (payload) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({}));
      const result = await executeDevboxAgentJob(
        { ...payload, leaseId: 'lease', runId: 'run' },
        {
          baseUrl: 'https://example.test',
          token: 'test-token',
          fetch: fetchMock,
          env: { TUTURUUU_DEVBOX_EXECUTION_MODE: 'judge-only' },
        }
      );
      expect(result).toEqual({ exitCode: 1, status: 'failed' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).events[0].message
      ).toBe('Host execution policy rejected this job.');
    }
  );
  it('fails closed for unknown modes and retains supervised restart in judge-only mode', async () => {
    const options = {
      baseUrl: 'https://example.test',
      token: 'test-token',
      fetch: vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({})),
    };
    const job = {
      command: ['__ttr_restart_agent_v1__'],
      leaseId: 'lease',
      runId: 'run',
    };
    expect(
      (
        await executeDevboxAgentJob(job, {
          ...options,
          env: { TUTURUUU_DEVBOX_EXECUTION_MODE: 'typo' },
        })
      ).status
    ).toBe('failed');
    expect(
      (
        await executeDevboxAgentJob(job, {
          ...options,
          env: { TUTURUUU_DEVBOX_EXECUTION_MODE: 'judge-only' },
        })
      ).status
    ).toBe('succeeded');
  });
});
