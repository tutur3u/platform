import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureViewerMock,
  queueBlueGreenInstantRolloutRequestMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureViewerMock: vi.fn(),
  queueBlueGreenInstantRolloutRequestMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  queueBlueGreenInstantRolloutRequest: queueBlueGreenInstantRolloutRequestMock,
}));

import { POST } from './route';

function createTestRequest() {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/instant-rollout',
    {
      method: 'POST',
    }
  ) as NextRequest;
}

describe('blue-green instant-rollout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authorization response when access is denied', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await POST(createTestRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('queues an instant standby sync request for authorized viewers', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    queueBlueGreenInstantRolloutRequestMock.mockReturnValue({
      kind: 'sync-standby',
      requestedAt: '2026-04-23T10:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });

    const response = await POST(createTestRequest());

    expect(response.status).toBe(200);
    expect(queueBlueGreenInstantRolloutRequestMock).toHaveBeenCalledWith({
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });
    await expect(response.json()).resolves.toMatchObject({
      message: 'Queued an instant standby sync request for the watcher.',
      request: {
        kind: 'sync-standby',
        requestedBy: 'user-1',
      },
    });
  });
});
