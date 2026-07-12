import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const resolveRequestActorAuthUidMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  hasUserGroupInWorkspace: vi.fn(),
  resolveRequestActorAuthUid: (
    ...args: Parameters<typeof resolveRequestActorAuthUidMock>
  ) => resolveRequestActorAuthUidMock(...args),
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof resolveUserGroupRouteWorkspaceIdMock>
  ) => resolveUserGroupRouteWorkspaceIdMock(...args),
}));

import { POST } from './route';

const wsId = '00000000-0000-0000-0000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000101';
const sessionId = '00000000-0000-4000-8000-000000000201';
const userId = '00000000-0000-4000-8000-000000000301';

function createAdminClientForSessions(
  sessions: Array<{ id: string; start_timezone: string; starts_at: string }>
) {
  const rpcMock = vi.fn().mockResolvedValue({ error: null });
  const sessionQuery = {
    eq: vi.fn(() => sessionQuery),
    in: vi.fn().mockResolvedValue({ data: sessions, error: null }),
    select: vi.fn(() => sessionQuery),
  };

  return {
    rpcMock,
    sbAdmin: {
      schema: vi.fn(() => ({
        from: vi.fn(() => sessionQuery),
        rpc: rpcMock,
      })),
    },
  };
}

describe('user group attendance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'check_user_attendance',
    });
    resolveRequestActorAuthUidMock.mockResolvedValue(
      '00000000-0000-4000-8000-000000000401'
    );
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(wsId);
  });

  it('saves attendance rows against a session id', async () => {
    const { rpcMock, sbAdmin } = createAdminClientForSessions([
      {
        id: sessionId,
        starts_at: '2026-01-12T00:00:00.000Z',
        start_timezone: 'UTC',
      },
    ]);
    createAdminClientMock.mockResolvedValue(sbAdmin);

    const response = await POST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${wsId}/user-groups/${groupId}/attendance`,
        {
          body: JSON.stringify([
            {
              date: '2026-01-12',
              notes: 'On time',
              session_id: sessionId,
              status: 'PRESENT',
              user_id: userId,
            },
          ]),
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ groupId, wsId }) }
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'admin_save_user_group_attendance_with_audit_actor',
      expect.objectContaining({
        p_payload: [
          expect.objectContaining({
            session_id: sessionId,
            status: 'PRESENT',
            user_id: userId,
          }),
        ],
      })
    );
  });

  it('rejects session attendance when the session does not match the route group/date', async () => {
    const { rpcMock, sbAdmin } = createAdminClientForSessions([]);
    createAdminClientMock.mockResolvedValue(sbAdmin);

    const response = await POST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${wsId}/user-groups/${groupId}/attendance`,
        {
          body: JSON.stringify([
            {
              date: '2026-01-12',
              session_id: sessionId,
              status: 'PRESENT',
              user_id: userId,
            },
          ]),
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ groupId, wsId }) }
    );

    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
