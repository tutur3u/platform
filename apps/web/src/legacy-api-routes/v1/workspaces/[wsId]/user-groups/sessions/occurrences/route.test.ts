import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const repairUserGroupSessionOccurrenceMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof resolveUserGroupRouteWorkspaceIdMock>
  ) => resolveUserGroupRouteWorkspaceIdMock(...args),
}));

vi.mock('@/lib/user-groups/session-schedule', () => ({
  repairUserGroupSessionOccurrence: (
    ...args: Parameters<typeof repairUserGroupSessionOccurrenceMock>
  ) => repairUserGroupSessionOccurrenceMock(...args),
}));

import { POST } from './route';

describe('workspace user group session occurrence repair route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue({ admin: true });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'update_user_groups',
    });
    repairUserGroupSessionOccurrenceMock.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000301',
    });
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('repairs one expected missing recurring occurrence', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/occurrences',
        {
          body: JSON.stringify({
            date: '2026-01-13',
            groupId: '00000000-0000-4000-8000-000000000101',
            seriesId: '00000000-0000-4000-8000-000000000201',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(repairUserGroupSessionOccurrenceMock).toHaveBeenCalledWith({
      date: '2026-01-13',
      groupId: '00000000-0000-4000-8000-000000000101',
      seriesId: '00000000-0000-4000-8000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('rejects dates that are not expected by the series', async () => {
    repairUserGroupSessionOccurrenceMock.mockRejectedValueOnce(
      new Error('not_expected_series_date')
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/occurrences',
        {
          body: JSON.stringify({
            date: '2026-01-14',
            groupId: '00000000-0000-4000-8000-000000000101',
            seriesId: '00000000-0000-4000-8000-000000000201',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  it('rejects mismatched group or series ids', async () => {
    repairUserGroupSessionOccurrenceMock.mockResolvedValueOnce(null);

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/occurrences',
        {
          body: JSON.stringify({
            date: '2026-01-13',
            groupId: '00000000-0000-4000-8000-000000000101',
            seriesId: '00000000-0000-4000-8000-000000000201',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(404);
  });
});
