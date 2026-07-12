import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const listUserGroupScheduleGroupSummariesMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof resolveUserGroupRouteWorkspaceIdMock>
  ) => resolveUserGroupRouteWorkspaceIdMock(...args),
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/session-schedule', () => ({
  listUserGroupScheduleGroupSummaries: (
    ...args: Parameters<typeof listUserGroupScheduleGroupSummariesMock>
  ) => listUserGroupScheduleGroupSummariesMock(...args),
}));

import { GET } from './route';

describe('workspace user group schedule group summaries route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue({ admin: true });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'view_user_groups',
    });
    listUserGroupScheduleGroupSummariesMock.mockResolvedValue([
      {
        exceptionCount: 0,
        groupId: '00000000-0000-4000-8000-000000000101',
        managerCount: 2,
        nonManagerCount: 14,
        patterns: [
          {
            daysOfWeek: [2, 4],
            endTime: '08:00',
            exceptionCount: 0,
            expectedCount: 8,
            occurrenceCount: 8,
            startTime: '07:00',
          },
        ],
        upcomingCount: 8,
      },
    ]);
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('lists summaries for requested workspace groups', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/group-summaries?from=2026-06-16T00%3A00%3A00.000Z&timezone=Asia%2FHo_Chi_Minh&groupIds=00000000-0000-4000-8000-000000000101,00000000-0000-4000-8000-000000000102'
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(listUserGroupScheduleGroupSummariesMock).toHaveBeenCalledWith({
      from: '2026-06-16T00:00:00.000Z',
      groupIds: [
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000102',
      ],
      supabase: { admin: true },
      timezone: 'Asia/Ho_Chi_Minh',
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('returns an empty result without a database client for empty group IDs', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/group-summaries?from=2026-06-16T00%3A00%3A00.000Z&timezone=Asia%2FHo_Chi_Minh'
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(listUserGroupScheduleGroupSummariesMock).not.toHaveBeenCalled();
  });

  it('requires view user group permission', async () => {
    getPermissionsMock.mockResolvedValueOnce({
      withoutPermission: () => true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/group-summaries?from=2026-06-16T00%3A00%3A00.000Z&groupIds=00000000-0000-4000-8000-000000000101'
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(listUserGroupScheduleGroupSummariesMock).not.toHaveBeenCalled();
  });
});
