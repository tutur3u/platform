import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeDevboxAgentMock,
  claimNextDevboxRunMock,
  completeDevboxRunMock,
  heartbeatDevboxRunnerMock,
  recordDevboxRunEventsMock,
} = vi.hoisted(() => ({
  authorizeDevboxAgentMock: vi.fn(),
  claimNextDevboxRunMock: vi.fn(),
  completeDevboxRunMock: vi.fn(),
  heartbeatDevboxRunnerMock: vi.fn(),
  recordDevboxRunEventsMock: vi.fn(),
}));

vi.mock('@/lib/devboxes/agent-auth', () => ({
  authorizeDevboxAgent: authorizeDevboxAgentMock,
}));

vi.mock('@/lib/devboxes/agent-store', () => ({
  claimNextDevboxRun: claimNextDevboxRunMock,
  completeDevboxRun: completeDevboxRunMock,
  heartbeatDevboxRunner: heartbeatDevboxRunnerMock,
  recordDevboxRunEvents: recordDevboxRunEventsMock,
}));

import { POST as events } from './events/route';
import { POST as heartbeat } from './heartbeat/route';
import { GET as poll } from './poll/route';

function createRequest(body?: unknown) {
  return new Request('http://localhost/api/v1/devboxes/agents', {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method: body === undefined ? 'GET' : 'POST',
  });
}

describe('devbox agent routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeDevboxAgentMock.mockResolvedValue({
      ok: true,
      runner: { id: 'runner-1' },
    });
  });

  it('records runner heartbeats', async () => {
    heartbeatDevboxRunnerMock.mockResolvedValue({
      message: 'heartbeat accepted',
    });

    const response = await heartbeat(createRequest());

    expect(response.status).toBe(200);
    expect(heartbeatDevboxRunnerMock).toHaveBeenCalledWith('runner-1');
    await expect(response.json()).resolves.toEqual({
      message: 'heartbeat accepted',
    });
  });

  it('claims queued jobs for the authenticated runner', async () => {
    claimNextDevboxRunMock.mockResolvedValue({
      command: ['bun', '--version'],
      leaseId: 'lease-1',
      runId: 'run-1',
    });

    const response = await poll(createRequest());

    expect(response.status).toBe(200);
    expect(claimNextDevboxRunMock).toHaveBeenCalledWith('runner-1');
    await expect(response.json()).resolves.toEqual({
      jobs: [
        {
          command: ['bun', '--version'],
          leaseId: 'lease-1',
          runId: 'run-1',
        },
      ],
    });
  });

  it('stores logs and terminal completion events', async () => {
    recordDevboxRunEventsMock.mockResolvedValue({ events: 1 });
    completeDevboxRunMock.mockResolvedValue({
      run: {
        exitCode: 0,
        id: 'run-1',
        leaseId: 'lease-1',
        status: 'succeeded',
      },
    });

    const response = await events(
      createRequest({
        completion: { exitCode: 0, status: 'succeeded' },
        events: [{ message: '1.3.14' }],
        runId: 'run-1',
      })
    );

    expect(response.status).toBe(200);
    expect(recordDevboxRunEventsMock).toHaveBeenCalledWith({
      events: [{ message: '1.3.14' }],
      runId: 'run-1',
      runnerId: 'runner-1',
    });
    expect(completeDevboxRunMock).toHaveBeenCalledWith({
      exitCode: 0,
      runId: 'run-1',
      runnerId: 'runner-1',
      status: 'succeeded',
    });
    await expect(response.json()).resolves.toMatchObject({
      events: 1,
      message: 'events accepted',
    });
  });
});
