import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordEvents, runCases, spawnProcess } = vi.hoisted(() => ({
  recordEvents: vi.fn(),
  spawnProcess: vi.fn(),
  runCases: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawn: spawnProcess }));

vi.mock('../platform-devbox', () => ({
  recordDevboxAgentEvents: recordEvents,
}));
vi.mock('./devbox-judge-sandbox', () => ({
  parseJudgeImages: () => ({ python: `python@sha256:${'a'.repeat(64)}` }),
  parseJudgePayload: () => ({
    cases: [],
    language: 'python',
    source: 'secret-source',
  }),
  parseJudgeResourceLimits: () => ({}),
  runJudgeCases: runCases,
}));

import { executeDevboxAgentJob } from './devbox-runner';

describe('Judge job dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEvents.mockResolvedValue({ ok: true });
    runCases.mockResolvedValue({
      passed: 1,
      results: [{ index: 0, passed: true, reason: 'passed', visible: true }],
    });
  });

  it('sends a typed Judge job to the sandbox without logging its source', async () => {
    const result = await executeDevboxAgentJob(
      {
        command: ['__ttr_judge_v1__', 'encoded-private-payload'],
        env: { __TTR_RESOURCE_LIMITS: '{}' },
        leaseId: 'lease-1',
        runId: 'run-1',
      },
      {
        baseUrl: 'https://example.com',
        env: { TUTURUUU_JUDGE_IMAGES: '{}' },
        token: 'token',
      }
    );

    expect(result.status).toBe('succeeded');
    expect(runCases).toHaveBeenCalledOnce();
    const events = recordEvents.mock.calls.map((call) => call[0].payload);
    expect(JSON.stringify(events)).not.toContain('secret-source');
    expect(JSON.stringify(events)).not.toContain('encoded-private-payload');
    expect(events).toContainEqual({
      completion: { exitCode: 0, status: 'succeeded' },
      runId: 'run-1',
    });
  });
});

describe('Reserved Playground command before hosted API integration', () => {
  it.each([
    ['__ttr_playground_v1__', 'encoded-private-payload'],
    ['__ttr_playground_v1__'],
  ])('fails closed without host execution for %j', async (...command) => {
    vi.clearAllMocks();
    recordEvents.mockResolvedValue({ ok: true });
    const result = await executeDevboxAgentJob(
      { command, leaseId: 'lease-1', runId: 'run-1' },
      { baseUrl: 'https://example.com', token: 'synthetic-token' }
    );
    expect(result).toEqual({ exitCode: 1, status: 'failed' });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(runCases).not.toHaveBeenCalled();
    expect(recordEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          completion: { exitCode: 1, status: 'failed' },
          runId: 'run-1',
        },
      })
    );
    expect(JSON.stringify(recordEvents.mock.calls)).not.toContain(
      'encoded-private-payload'
    );
  });
});
