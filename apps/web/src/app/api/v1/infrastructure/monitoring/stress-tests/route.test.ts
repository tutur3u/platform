import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  createQueuedStressTestRunMock,
  getPermissionsMock,
  persistStressTestRunMock,
  queueStressTestRunFileMock,
  readStressTestSnapshotMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createQueuedStressTestRunMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  persistStressTestRunMock: vi.fn(),
  queueStressTestRunFileMock: vi.fn(),
  readStressTestSnapshotMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
  withRequestLogDrain: (_opts: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock('@/lib/infrastructure/stress-testing', () => ({
  createQueuedStressTestRun: createQueuedStressTestRunMock,
  persistStressTestRun: persistStressTestRunMock,
  queueStressTestRunFile: queueStressTestRunFileMock,
  readStressTestSnapshot: readStressTestSnapshotMock,
}));

import { GET, POST } from './route';

function createPermissionsResult(permissions: string[] = []) {
  return {
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    permissions,
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

function createTestRequest(method = 'GET', body?: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/stress-tests',
    {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      method,
    }
  ) as NextRequest;
}

describe('infrastructure stress-test route', () => {
  const authGetUserMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock,
      },
    });
    readStressTestSnapshotMock.mockResolvedValue({
      activeRun: null,
      canManage: false,
      profiles: [],
      recentRuns: [],
      targets: [],
    });
  });

  it('allows infrastructure viewers to read the snapshot', async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    getPermissionsMock
      .mockResolvedValueOnce(createPermissionsResult(['view_infrastructure']))
      .mockResolvedValueOnce(createPermissionsResult(['view_infrastructure']));

    const response = await GET(createTestRequest());

    expect(response.status).toBe(200);
    expect(readStressTestSnapshotMock).toHaveBeenCalledWith({
      canManage: false,
    });
  });

  it('rejects queue requests without the stress-test permission', async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['view_infrastructure'])
    );

    const response = await POST(
      createTestRequest('POST', {
        profileId: 'smoke',
        targetId: 'local-web',
      })
    );

    expect(response.status).toBe(403);
    expect(queueStressTestRunFileMock).not.toHaveBeenCalled();
  });

  it('queues a run for stress-test managers', async () => {
    const run = { id: 'run-1', status: 'queued' };
    authGetUserMock.mockResolvedValue({
      data: { user: { email: 'ops@tuturuuu.com', id: 'user-1' } },
    });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_infrastructure_stress_tests'])
    );
    createQueuedStressTestRunMock.mockReturnValue(run);

    const response = await POST(
      createTestRequest('POST', {
        profileId: 'smoke',
        targetId: 'local-web',
      })
    );

    expect(response.status).toBe(200);
    expect(createQueuedStressTestRunMock).toHaveBeenCalledWith({
      payload: {
        profileId: 'smoke',
        targetId: 'local-web',
      },
      requestedBy: 'user-1',
      requestedByEmail: 'ops@tuturuuu.com',
    });
    expect(queueStressTestRunFileMock).toHaveBeenCalledWith(run);
    expect(persistStressTestRunMock).toHaveBeenCalledWith(run);
  });
});
