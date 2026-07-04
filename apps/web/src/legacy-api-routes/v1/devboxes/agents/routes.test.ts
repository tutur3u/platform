import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeDevboxAgentMock,
  claimNextDevboxRunMock,
  completeDevboxRunMock,
  heartbeatDevboxRunnerMock,
  recordDevboxRunEventsMock,
  shutdownDevboxRunnerMock,
} = vi.hoisted(() => ({
  authorizeDevboxAgentMock: vi.fn(),
  claimNextDevboxRunMock: vi.fn(),
  completeDevboxRunMock: vi.fn(),
  heartbeatDevboxRunnerMock: vi.fn(),
  recordDevboxRunEventsMock: vi.fn(),
  shutdownDevboxRunnerMock: vi.fn(),
}));

vi.mock('@/lib/devboxes/agent-auth', () => ({
  authorizeDevboxAgent: authorizeDevboxAgentMock,
}));

vi.mock('@/lib/devboxes/agent-store', () => ({
  claimNextDevboxRun: claimNextDevboxRunMock,
  completeDevboxRun: completeDevboxRunMock,
  heartbeatDevboxRunner: heartbeatDevboxRunnerMock,
  recordDevboxRunEvents: recordDevboxRunEventsMock,
  shutdownDevboxRunner: shutdownDevboxRunnerMock,
}));

import { POST as events } from './events/route';
import { POST as heartbeat } from './heartbeat/route';
import { GET as poll } from './poll/route';
import { POST as shutdown } from './shutdown/route';

function createRequest(body?: unknown) {
  return new Request('http://localhost/api/v1/devboxes/agents', {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method: body === undefined ? 'GET' : 'POST',
  });
}

function mockAuthorizedRunner(heartbeatEnabled: boolean) {
  authorizeDevboxAgentMock.mockResolvedValue({
    ok: true,
    runner: { heartbeatEnabled, id: 'runner-1' },
  });
}

describe('devbox agent routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizedRunner(false);
  });

  it('blocks runner heartbeats until an admin enables them', async () => {
    const response = await heartbeat(createRequest());

    expect(response.status).toBe(403);
    expect(heartbeatDevboxRunnerMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'Heartbeat disabled for this runner',
    });
  });

  it('preserves unauthorized heartbeat responses for invalid runner tokens', async () => {
    authorizeDevboxAgentMock.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
    });

    const response = await heartbeat(createRequest());

    expect(response.status).toBe(401);
    expect(heartbeatDevboxRunnerMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
  });

  it('records runner heartbeats', async () => {
    mockAuthorizedRunner(true);
    heartbeatDevboxRunnerMock.mockResolvedValue({
      message: 'heartbeat accepted',
    });

    const response = await heartbeat(createRequest());

    expect(response.status).toBe(200);
    expect(heartbeatDevboxRunnerMock).toHaveBeenCalledWith(
      'runner-1',
      undefined
    );
    await expect(response.json()).resolves.toEqual({
      message: 'heartbeat accepted',
    });
  });

  it('records runner heartbeat capabilities', async () => {
    mockAuthorizedRunner(true);
    heartbeatDevboxRunnerMock.mockResolvedValue({
      message: 'heartbeat accepted',
    });

    const capabilities = {
      cli: { name: 'ttr', version: '0.2.0' },
      os: { arch: 'arm64', platform: 'darwin', release: '25.0.0' },
      resources: {
        cpu: { cores: 10, model: 'Apple' },
        loadAverage: [1, 2, 3],
        memory: { freeBytes: 1024, totalBytes: 2048 },
        uptimeSeconds: 120,
      },
      runtimes: { bun: '1.3.14', node: 'v26.0.0' },
      tools: { docker: 'Docker version 29.0.0', git: 'git version 2.54.0' },
    };

    const response = await heartbeat(createRequest({ capabilities }));

    expect(response.status).toBe(200);
    expect(heartbeatDevboxRunnerMock).toHaveBeenCalledWith(
      'runner-1',
      capabilities
    );
  });

  it('rejects invalid runner heartbeat bodies after heartbeat is enabled', async () => {
    mockAuthorizedRunner(true);

    const response = await heartbeat(
      createRequest({
        capabilities: {
          cli: { name: 'ttr', version: '0.2.0' },
          unexpected: true,
        },
      })
    );

    expect(response.status).toBe(400);
    expect(heartbeatDevboxRunnerMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid heartbeat body',
    });
  });

  it('shuts down the authenticated runner', async () => {
    shutdownDevboxRunnerMock.mockResolvedValue({
      message: 'Devbox runner removed from the cluster.',
      runner: { id: 'runner-1', status: 'revoked' },
    });

    const response = await shutdown(createRequest());

    expect(response.status).toBe(200);
    expect(shutdownDevboxRunnerMock).toHaveBeenCalledWith('runner-1');
    await expect(response.json()).resolves.toEqual({
      message: 'Devbox runner removed from the cluster.',
      runner: { id: 'runner-1', status: 'revoked' },
    });
  });

  it('claims queued jobs for the authenticated runner', async () => {
    claimNextDevboxRunMock.mockResolvedValue({
      command: ['bun', '--version'],
      leaseId: 'lease-1',
      runId: 'run-1',
    });

    const request = createRequest();
    const response = await poll(request);

    expect(response.status).toBe(200);
    expect(authorizeDevboxAgentMock).toHaveBeenCalledWith(request, {
      requireOnline: true,
    });
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

    const request = createRequest({
      completion: { exitCode: 0, status: 'succeeded' },
      events: [{ message: '1.3.14' }],
      runId: 'run-1',
    });
    const response = await events(request);

    expect(response.status).toBe(200);
    expect(authorizeDevboxAgentMock).toHaveBeenCalledWith(request, {
      requireOnline: true,
    });
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
