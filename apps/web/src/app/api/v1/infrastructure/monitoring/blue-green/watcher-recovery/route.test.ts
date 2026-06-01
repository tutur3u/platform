import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  queueBlueGreenWatcherRecoveryRequestMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  queueBlueGreenWatcherRecoveryRequestMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  queueBlueGreenWatcherRecoveryRequest:
    queueBlueGreenWatcherRecoveryRequestMock,
}));

import { POST } from './route';

function createTestRequest(body: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/watcher-recovery',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  ) as NextRequest;
}

describe('blue-green watcher-recovery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the operator authorization response before queueing recovery', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(
      createTestRequest({ projectId: 'project-1', reason: 'manual recovery' })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(queueBlueGreenWatcherRecoveryRequestMock).not.toHaveBeenCalled();
  });

  it('queues watcher recovery for authorized operators', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    queueBlueGreenWatcherRecoveryRequestMock.mockReturnValue({
      kind: 'watcher-recovery',
      projectId: 'project-1',
      reason: 'manual recovery',
      requestedBy: 'user-1',
    });

    const response = await POST(
      createTestRequest({
        projectBranch: 'main',
        projectId: ' project-1 ',
        reason: ' manual recovery ',
        watcherBranch: 'production',
        watcherHealth: 'stale',
      })
    );

    expect(response.status).toBe(200);
    expect(queueBlueGreenWatcherRecoveryRequestMock).toHaveBeenCalledWith({
      projectBranch: 'main',
      projectId: 'project-1',
      reason: 'manual recovery',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
      watcherBranch: 'production',
      watcherHealth: 'stale',
    });
  });
});
