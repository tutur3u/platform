import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  queueBlueGreenDeploymentRevertRequestMock,
  readBlueGreenMonitoringSnapshotMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  queueBlueGreenDeploymentRevertRequestMock: vi.fn(),
  readBlueGreenMonitoringSnapshotMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringSnapshot: readBlueGreenMonitoringSnapshotMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  queueBlueGreenDeploymentRevertRequest:
    queueBlueGreenDeploymentRevertRequestMock,
}));

import { POST } from './route';

function createTestRequest(body: unknown = { commitHash: 'cached123456789' }) {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/deployment-revert',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  ) as NextRequest;
}

function createSnapshot() {
  return {
    deployments: [
      {
        commitHash: 'cached123456789',
        commitShortHash: 'cached1',
        commitSubject: 'Known cached build',
        deploymentStamp: 'deploy-cached',
        status: 'successful',
      },
      {
        commitHash: 'old123456789',
        commitShortHash: 'old1234',
        commitSubject: 'Known old build',
        deploymentStamp: 'deploy-old',
        status: 'successful',
      },
    ],
    recoveryCache: {
      deployments: [
        {
          commitHash: 'cached123456789',
          imageTag: 'platform-web-cache:cached1',
        },
      ],
    },
  };
}

describe('blue-green deployment-revert route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    readBlueGreenMonitoringSnapshotMock.mockReturnValue(createSnapshot());
    queueBlueGreenDeploymentRevertRequestMock.mockImplementation((request) => ({
      kind: 'deployment-revert',
      requestedAt: '2026-06-10T10:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
      ...request,
    }));
  });

  it('returns the authorization response when access is denied', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await POST(createTestRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('queues an instant cached revert for cached deployments', async () => {
    const response = await POST(
      createTestRequest({
        commitHash: 'cached123456789',
        imageTag: 'platform-web-cache:cached1',
      })
    );

    expect(response.status).toBe(200);
    expect(queueBlueGreenDeploymentRevertRequestMock).toHaveBeenCalledWith({
      commitHash: 'cached123456789',
      commitShortHash: 'cached1',
      commitSubject: 'Known cached build',
      deploymentStamp: 'deploy-cached',
      imageTag: 'platform-web-cache:cached1',
      instant: true,
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });
    await expect(response.json()).resolves.toMatchObject({
      request: {
        commitHash: 'cached123456789',
        imageTag: 'platform-web-cache:cached1',
        instant: true,
      },
    });
  });

  it('queues a rollback pin request when no cached image is retained', async () => {
    const response = await POST(createTestRequest({ commitHash: 'old1234' }));

    expect(response.status).toBe(200);
    expect(queueBlueGreenDeploymentRevertRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commitHash: 'old123456789',
        imageTag: null,
        instant: false,
      })
    );
  });

  it('rejects missing or unknown commit hashes', async () => {
    const invalidResponse = await POST(
      createTestRequest({ commitHash: 'bad' })
    );

    expect(invalidResponse.status).toBe(400);

    const missingResponse = await POST(
      createTestRequest({ commitHash: 'missing123456' })
    );

    expect(missingResponse.status).toBe(404);
  });
});
