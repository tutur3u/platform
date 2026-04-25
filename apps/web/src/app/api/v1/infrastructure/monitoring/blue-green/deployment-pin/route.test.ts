import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureViewerMock,
  clearBlueGreenDeploymentPinMock,
  readBlueGreenMonitoringSnapshotMock,
  writeBlueGreenDeploymentPinMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureViewerMock: vi.fn(),
  clearBlueGreenDeploymentPinMock: vi.fn(),
  readBlueGreenMonitoringSnapshotMock: vi.fn(),
  writeBlueGreenDeploymentPinMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringSnapshot: readBlueGreenMonitoringSnapshotMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  clearBlueGreenDeploymentPin: clearBlueGreenDeploymentPinMock,
  writeBlueGreenDeploymentPin: writeBlueGreenDeploymentPinMock,
}));

import { DELETE, POST } from './route';

function createTestRequest(body?: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/deployment-pin',
    body === undefined
      ? {
          method: 'DELETE',
        }
      : {
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
  ) as NextRequest;
}

describe('blue-green deployment-pin route', () => {
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

    const response = await POST(createTestRequest({ commitHash: 'abc1234' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('requires a usable commit hash', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });

    const response = await POST(createTestRequest({ commitHash: 'abc' }));

    expect(response.status).toBe(400);
    expect(writeBlueGreenDeploymentPinMock).not.toHaveBeenCalled();
  });

  it('pins a successful deployment by full commit hash', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    readBlueGreenMonitoringSnapshotMock.mockReturnValue({
      deployments: [
        {
          commitHash: 'old123456789',
          commitShortHash: 'old1234',
          commitSubject: 'Known good deployment',
          deploymentStamp: 'deploy-2026-04-20T10-00-00Z',
          status: 'successful',
        },
        {
          commitHash: 'bad123456789',
          status: 'failed',
        },
      ],
    });
    writeBlueGreenDeploymentPinMock.mockReturnValue({
      commitHash: 'old123456789',
      kind: 'deployment-pin',
      requestedBy: 'user-1',
    });

    const response = await POST(
      createTestRequest({ commitHash: 'old123456789' })
    );

    expect(response.status).toBe(200);
    expect(writeBlueGreenDeploymentPinMock).toHaveBeenCalledWith({
      activeColor: null,
      commitHash: 'old123456789',
      commitShortHash: 'old1234',
      commitSubject: 'Known good deployment',
      deploymentStamp: 'deploy-2026-04-20T10-00-00Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });
    await expect(response.json()).resolves.toMatchObject({
      pin: {
        commitHash: 'old123456789',
        kind: 'deployment-pin',
      },
    });
  });

  it('does not pin failed deployments', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    readBlueGreenMonitoringSnapshotMock.mockReturnValue({
      deployments: [
        {
          commitHash: 'bad123456789',
          commitShortHash: 'bad1234',
          status: 'failed',
        },
      ],
    });

    const response = await POST(createTestRequest({ commitHash: 'bad1234' }));

    expect(response.status).toBe(404);
    expect(writeBlueGreenDeploymentPinMock).not.toHaveBeenCalled();
  });

  it('clears the current deployment pin', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });

    const response = await DELETE(createTestRequest());

    expect(response.status).toBe(200);
    expect(clearBlueGreenDeploymentPinMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      message: 'Cleared the pinned deployment.',
    });
  });
});
