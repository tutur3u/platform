import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createUserGroupSessionMock = vi.fn();
const getPermissionsMock = vi.fn();
const listUserGroupSessionsMock = vi.fn();
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
  createUserGroupSession: (
    ...args: Parameters<typeof createUserGroupSessionMock>
  ) => createUserGroupSessionMock(...args),
  listUserGroupSessions: (
    ...args: Parameters<typeof listUserGroupSessionsMock>
  ) => listUserGroupSessionsMock(...args),
}));

import { GET, POST } from './route';

describe('workspace user group sessions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue({ admin: true });
    createUserGroupSessionMock.mockResolvedValue({
      id: 'session-1',
      startsAt: '2026-01-12T12:00:00.000Z',
    });
    listUserGroupSessionsMock.mockResolvedValue({
      data: [],
      groups: [],
      missing: [],
      tags: [],
    });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        !['update_user_groups', 'view_user_groups'].includes(permission),
    });
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('passes includeMissing through schedule list requests', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions?groupId=00000000-0000-4000-8000-000000000101&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&includeMissing=true'
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(listUserGroupSessionsMock).toHaveBeenCalledWith({
      from: '2026-01-01T00:00:00.000Z',
      groupId: '00000000-0000-4000-8000-000000000101',
      includeMissing: true,
      supabase: { admin: true },
      to: '2026-02-01T00:00:00.000Z',
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('creates recurring sessions with tags and files', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions',
        {
          body: JSON.stringify({
            description: '# Lesson plan',
            descriptionJson: {
              content: [
                {
                  content: [{ text: 'Lesson plan', type: 'text' }],
                  type: 'paragraph',
                },
              ],
              type: 'doc',
            },
            endTimezone: 'Asia/Ho_Chi_Minh',
            endsAt: '2026-01-12T13:30:00.000Z',
            files: [{ storagePath: 'user-groups/group-1/lesson.pdf' }],
            groupId: '00000000-0000-4000-8000-000000000101',
            recurrence: {
              daysOfWeek: [6, 2, 4, 2],
              intervalWeeks: 1,
              untilDate: '2026-06-30',
            },
            startTimezone: 'Asia/Ho_Chi_Minh',
            startsAt: '2026-01-12T12:00:00.000Z',
            tagNames: ['Exam prep', 'Makeup'],
            title: 'Math A1',
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
    expect(createUserGroupSessionMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        recurrence: {
          daysOfWeek: [2, 4, 6],
          intervalWeeks: 1,
          untilDate: '2026-06-30',
        },
        descriptionJson: {
          content: [
            {
              content: [{ text: 'Lesson plan', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        files: [{ storagePath: 'user-groups/group-1/lesson.pdf' }],
        tagNames: ['Exam prep', 'Makeup'],
      }),
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('rejects invalid session ranges', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions',
        {
          body: JSON.stringify({
            endTimezone: 'Asia/Ho_Chi_Minh',
            endsAt: '2026-01-12T12:00:00.000Z',
            groupId: '00000000-0000-4000-8000-000000000101',
            startTimezone: 'Asia/Ho_Chi_Minh',
            startsAt: '2026-01-12T13:00:00.000Z',
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
    expect(createUserGroupSessionMock).not.toHaveBeenCalled();
  });
});
