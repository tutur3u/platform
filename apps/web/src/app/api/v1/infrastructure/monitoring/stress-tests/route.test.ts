import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  createQueuedStressTestRunMock,
  getPermissionsMock,
  persistStressTestRunMock,
  queueStressTestAbortFileMock,
  queueStressTestRunFileMock,
  readStressTestRunMock,
  readStressTestSnapshotMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createQueuedStressTestRunMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  persistStressTestRunMock: vi.fn(),
  queueStressTestAbortFileMock: vi.fn(),
  queueStressTestRunFileMock: vi.fn(),
  readStressTestRunMock: vi.fn(),
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
  setLogDrainUserContext: vi.fn(),
  withRequestLogDrain: (_opts: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock('@/lib/infrastructure/stress-testing', () => ({
  createQueuedStressTestRun: createQueuedStressTestRunMock,
  persistStressTestRun: persistStressTestRunMock,
  queueStressTestAbortFile: queueStressTestAbortFileMock,
  queueStressTestRunFile: queueStressTestRunFileMock,
  readStressTestRun: readStressTestRunMock,
  readStressTestSnapshot: readStressTestSnapshotMock,
}));

import { POST as abortPost } from './[runId]/abort/route';
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
    readStressTestRunMock.mockResolvedValue(null);
  });

  function authorizeStressTestManager() {
    authGetUserMock.mockResolvedValue({
      data: { user: { email: 'ops@tuturuuu.com', id: 'user-1' } },
    });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_infrastructure_stress_tests'])
    );
  }

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
    authorizeStressTestManager();
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

  it('rejects invalid queue payloads as bad requests', async () => {
    authorizeStressTestManager();

    const response = await POST(
      createTestRequest('POST', {
        profileId: 'invalid',
        targetId: 'local-web',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('STRESS_TEST_INVALID_REQUEST');
    expect(body.message).toContain('profileId');
    expect(queueStressTestRunFileMock).not.toHaveBeenCalled();
  });

  it('does not persist the run when queue control-file writes fail', async () => {
    const run = { id: 'run-1', status: 'queued' };
    authorizeStressTestManager();
    createQueuedStressTestRunMock.mockReturnValue(run);
    queueStressTestRunFileMock.mockImplementation(() => {
      throw new Error(
        "ENOENT: no such file or directory, mkdir '/app/runtime/docker-web/stress-tests/runs/run-1'"
      );
    });

    const response = await POST(
      createTestRequest('POST', {
        profileId: 'smoke',
        targetId: 'local-web',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('STRESS_TEST_CONTROL_WRITE_FAILED');
    expect(body.message).toContain(
      'Unable to write stress-test control files: ENOENT'
    );
    expect(persistStressTestRunMock).not.toHaveBeenCalled();
  });

  it('returns detailed abort errors when abort control-file writes fail', async () => {
    authorizeStressTestManager();
    readStressTestRunMock.mockResolvedValue({
      id: 'run-1',
      status: 'queued',
      updatedAt: 1000,
    });
    queueStressTestAbortFileMock.mockImplementation(() => {
      throw new Error(
        "EACCES: permission denied, open '/app/runtime/docker-web-control/stress-tests/abort-requests/run-1.json'"
      );
    });

    const response = await abortPost(
      createTestRequest('POST', { reason: 'Stop it' }),
      {
        params: Promise.resolve({ runId: 'run-1' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('STRESS_TEST_CONTROL_WRITE_FAILED');
    expect(body.message).toContain(
      'Unable to write stress-test control files: EACCES'
    );
    expect(persistStressTestRunMock).not.toHaveBeenCalled();
  });
});
