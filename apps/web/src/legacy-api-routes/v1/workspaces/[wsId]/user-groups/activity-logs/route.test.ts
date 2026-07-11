import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPermissionsMock = vi.fn();
const listUserGroupActivityEventsForRangeMock = vi.fn();

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@tuturuuu/users-core/lib/user-group-activity/data', () => ({
  listUserGroupActivityEventsForRange: (
    ...args: Parameters<typeof listUserGroupActivityEventsForRangeMock>
  ) => listUserGroupActivityEventsForRangeMock(...args),
}));

import { GET } from './route';

describe('user group activity logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs',
    });
    listUserGroupActivityEventsForRangeMock.mockResolvedValue({
      count: 1,
      data: [
        {
          action: 'created',
          actor: {
            authUid: 'actor-1',
            email: 'teacher@example.com',
            id: 'actor-1',
            name: 'Teacher One',
            workspaceUserId: 'workspace-actor-1',
          },
          affectedUser: {
            email: 'student@example.com',
            id: 'student-1',
            name: 'Student One',
          },
          auditRecordId: 123,
          before: {},
          after: { role: 'STUDENT' },
          changedFields: ['group_id', 'role', 'user_id'],
          fieldChanges: [],
          group: {
            id: 'group-1',
            name: 'Class A',
          },
          occurredAt: '2026-05-21T01:00:00.000Z',
          resourceId: 'student-1',
          resourceLabel: 'Student One',
          resourceType: 'membership',
          summary: 'Added Student One to Class A as STUDENT',
          tableName: 'workspace_user_groups_users',
        },
      ],
    });
  });

  it('rejects callers without audit permission', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/activity-logs?start=2026-05-01T00:00:00.000Z&end=2026-06-01T00:00:00.000Z'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it('forwards filters and returns normalized activity events', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/activity-logs?start=2026-05-01T00:00:00.000Z&end=2026-06-01T00:00:00.000Z&groupId=group-1&resourceType=membership&action=created&affectedUserQuery=student&actorQuery=teacher&query=Class&offset=10&limit=25'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        expect.objectContaining({
          auditRecordId: 123,
          resourceType: 'membership',
          summary: 'Added Student One to Class A as STUDENT',
        }),
      ],
    });
    expect(listUserGroupActivityEventsForRangeMock).toHaveBeenCalledWith({
      wsId: 'ws-1',
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-06-01T00:00:00.000Z',
      groupId: 'group-1',
      resourceType: 'membership',
      action: 'created',
      affectedUserQuery: 'student',
      actorQuery: 'teacher',
      query: 'Class',
      offset: 10,
      limit: 25,
    });
  });
});
