import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPermissionsMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  resolveRequestActorAuthUid: vi.fn(),
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof resolveUserGroupRouteWorkspaceIdMock>
  ) => resolveUserGroupRouteWorkspaceIdMock(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: vi.fn(),
}));

vi.mock('@/lib/user-groups/session-schedule', () => ({
  listUserGroupSessionDates: vi.fn(),
}));

import { PUT } from './route';

describe('workspace user group route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue('ws-1');
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'update_user_groups',
    });
  });

  it('rejects legacy sessions payloads', async () => {
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/group-1',
        {
          body: JSON.stringify({ sessions: ['2026-01-12'] }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          groupId: 'group-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        'Legacy sessions payloads are no longer accepted. Use the user group sessions API.',
    });
  });
});
