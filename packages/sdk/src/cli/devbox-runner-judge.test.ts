import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordEvents, runCases, spawnProcess, runPlayground } = vi.hoisted(
  () => ({
    recordEvents: vi.fn(),
    spawnProcess: vi.fn(),
    runCases: vi.fn(),
    runPlayground: vi.fn(),
  })
);

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

vi.mock('./devbox-playground-sandbox', () => ({
  runPlaygroundJob: runPlayground,
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

describe('Typed hosted Playground command boundary', () => {
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
    expect(runPlayground).not.toHaveBeenCalled();
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

it('dispatches hosted jobs to the sandbox and saves only through the canonical callback', async () => {
  vi.clearAllMocks();
  recordEvents.mockResolvedValue({ ok: true });
  const delta = {
    files: [{ path: 'main.py', content: 'synthetic' }],
    paths: ['main.py'],
  };
  runPlayground.mockImplementation(async (_payload, _limits, save) => {
    await save(delta);
    return { code: 0, output: 'completed' };
  });
  const request = vi.fn<typeof fetch>(
    async () => new Response('{}', { status: 200 })
  );
  const result = await executeDevboxAgentJob(
    {
      command: ['__ttr_playground_v1__', 'encoded-private-payload'],
      env: { __TTR_RESOURCE_LIMITS: '{}' },
      leaseId: 'lease-1',
      runId: 'run-1',
    },
    { baseUrl: 'https://example.com', token: 'synthetic-token', fetch: request }
  );
  expect(result).toEqual({ exitCode: 0, status: 'succeeded' });
  expect(runPlayground).toHaveBeenCalledOnce();
  expect(spawnProcess).not.toHaveBeenCalled();
  expect(runCases).not.toHaveBeenCalled();
  const [url, options] = request.mock.calls[0]!;
  expect(String(url)).toBe(
    'https://example.com/api/v1/devboxes/agents/playground-files'
  );
  expect(options?.method).toBe('POST');
  expect(options?.headers).toMatchObject({
    'X-Devbox-Runner-Token': 'synthetic-token',
  });
  expect(JSON.parse(String(options?.body))).toEqual({
    runId: 'run-1',
    ...delta,
  });
  expect(JSON.stringify(recordEvents.mock.calls)).not.toContain(
    'encoded-private-payload'
  );
});
