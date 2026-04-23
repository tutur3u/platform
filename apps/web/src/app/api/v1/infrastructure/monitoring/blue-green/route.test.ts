import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  getPermissionsMock,
  readBlueGreenMonitoringSnapshotMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  readBlueGreenMonitoringSnapshotMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringSnapshot: readBlueGreenMonitoringSnapshotMock,
}));

import { GET } from './route';

function createPermissionsResult(permissions: string[] = []) {
  return {
    permissions,
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

function createTestRequest(query = '') {
  return new Request(
    `http://localhost/api/v1/infrastructure/monitoring/blue-green${query}`
  ) as NextRequest;
}

describe('blue-green monitoring route', () => {
  const authGetUserMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock,
      },
    });
  });

  it('rejects unauthenticated requests', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } });

    const response = await GET(createTestRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  it('rejects authenticated users without infrastructure access', async () => {
    const request = createTestRequest();
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getPermissionsMock.mockResolvedValue(createPermissionsResult());

    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      request,
    });
  });

  it('returns the monitoring snapshot for authorized viewers', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['view_infrastructure'])
    );
    readBlueGreenMonitoringSnapshotMock.mockReturnValue({
      analytics: {
        current: {
          daily: null,
          monthly: null,
          weekly: null,
          yearly: null,
        },
        recentRequests: [],
        totalPersistedLogs: 480,
        trends: {
          daily: [],
          monthly: [],
          weekly: [],
          yearly: [],
        },
      },
      deployments: [
        {
          activeColor: 'green',
          buildDurationMs: 42_000,
          commitShortHash: 'abc123',
          status: 'successful',
        },
      ],
      dockerResources: {
        containers: [],
        message: null,
        state: 'live',
        totalCpuPercent: 4.2,
        totalMemoryBytes: 1024,
        totalRxBytes: 2048,
        totalTxBytes: 4096,
      },
      overview: {
        averageBuildDurationMs: 42_000,
        currentAverageRequestsPerMinute: 12,
        currentPeakRequestsPerMinute: 18,
        currentRequestCount: 320,
        failedDeployments: 0,
        successfulDeployments: 1,
        totalDeployments: 1,
        totalPersistedLogs: 480,
        totalRequestsServed: 320,
      },
      runtime: {
        activatedAt: Date.now(),
        activeColor: 'green',
        averageRequestsPerMinute: 12,
        dailyAverageRequests: 240,
        dailyPeakRequests: 300,
        dailyRequestCount: 120,
        deploymentStamp: '2026-04-21T10-00-00Z',
        lifetimeMs: 90_000,
        liveColors: ['green', 'blue'],
        peakRequestsPerMinute: 18,
        requestCount: 320,
        serviceContainers: {},
        standbyColor: 'blue',
        state: 'serving',
      },
      source: {
        historyAvailable: true,
        monitoringDirAvailable: true,
        statusAvailable: true,
      },
      watcher: {
        args: ['--interval-ms', '1000'],
        events: [],
        health: 'live',
        intervalMs: 1000,
        lastCheckAt: Date.now(),
        lastDeployAt: Date.now(),
        lastDeployStatus: 'successful',
        logs: [],
        lastResult: { status: 'up-to-date' },
        latestCommit: {
          committedAt: '2026-04-21T10:00:00.000Z',
          hash: 'abc123456789',
          shortHash: 'abc123',
          subject: 'Ship observability',
        },
        lock: {
          branch: 'main',
          createdAt: '2026-04-21T10:00:00.000Z',
          upstreamRef: 'origin/main',
        },
        nextCheckAt: Date.now() + 1000,
        status: 'healthy',
        target: {
          branch: 'main',
          upstreamRef: 'origin/main',
        },
        updatedAt: Date.now(),
      },
    });

    const response = await GET(createTestRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runtime: {
        activeColor: 'green',
        state: 'serving',
      },
      watcher: {
        health: 'live',
        status: 'healthy',
      },
    });
  });

  it('passes preview limits to the monitoring snapshot reader', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['view_infrastructure'])
    );
    readBlueGreenMonitoringSnapshotMock.mockReturnValue({
      analytics: {
        current: {
          daily: null,
          monthly: null,
          weekly: null,
          yearly: null,
        },
        recentRequests: [],
        totalPersistedLogs: 0,
        trends: {
          daily: [],
          monthly: [],
          weekly: [],
          yearly: [],
        },
      },
      deployments: [],
      dockerResources: {
        containers: [],
        message: null,
        state: 'idle',
        totalCpuPercent: 0,
        totalMemoryBytes: 0,
        totalRxBytes: 0,
        totalTxBytes: 0,
      },
      overview: {
        averageBuildDurationMs: null,
        currentAverageRequestsPerMinute: null,
        currentPeakRequestsPerMinute: null,
        currentRequestCount: null,
        failedDeployments: 0,
        successfulDeployments: 0,
        totalDeployments: 0,
        totalPersistedLogs: 0,
        totalRequestsServed: 0,
      },
      runtime: {
        activatedAt: null,
        activeColor: null,
        averageRequestsPerMinute: null,
        dailyAverageRequests: null,
        dailyPeakRequests: null,
        dailyRequestCount: null,
        deploymentStamp: null,
        lifetimeMs: null,
        liveColors: [],
        peakRequestsPerMinute: null,
        requestCount: null,
        serviceContainers: {},
        standbyColor: null,
        state: 'idle',
      },
      source: {
        historyAvailable: false,
        monitoringDirAvailable: true,
        statusAvailable: true,
      },
      watcher: {
        args: [],
        events: [],
        health: 'live',
        intervalMs: null,
        lastCheckAt: null,
        lastDeployAt: null,
        lastDeployStatus: null,
        logs: [],
        lastResult: null,
        latestCommit: null,
        lock: null,
        nextCheckAt: null,
        status: 'healthy',
        target: null,
        updatedAt: null,
      },
    });

    const response = await GET(
      createTestRequest('?requestPreviewLimit=8&watcherLogLimit=6')
    );

    expect(response.status).toBe(200);
    expect(readBlueGreenMonitoringSnapshotMock).toHaveBeenCalledWith({
      requestPreviewLimit: 8,
      watcherLogLimit: 6,
    });
  });
});
