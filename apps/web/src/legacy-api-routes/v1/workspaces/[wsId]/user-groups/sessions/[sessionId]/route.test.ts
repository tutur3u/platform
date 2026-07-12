import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const resolveUserGroupRouteWorkspaceIdMock = vi.fn();
const updateUserGroupSessionMock = vi.fn();

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
  updateUserGroupSession: (
    ...args: Parameters<typeof updateUserGroupSessionMock>
  ) => updateUserGroupSessionMock(...args),
}));

import { PUT } from './route';

describe('workspace user group session update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue({ admin: true });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission !== 'update_user_groups',
    });
    resolveUserGroupRouteWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    updateUserGroupSessionMock.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000201',
    });
  });

  it('updates one session for drag and resize payloads', async () => {
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201',
        {
          body: JSON.stringify({
            descriptionJson: {
              content: [
                {
                  content: [{ text: 'Updated notes', type: 'text' }],
                  type: 'paragraph',
                },
              ],
              type: 'doc',
            },
            endTimezone: 'Asia/Ho_Chi_Minh',
            endsAt: '2026-01-12T14:00:00.000Z',
            scope: 'once',
            startTimezone: 'Asia/Ho_Chi_Minh',
            startsAt: '2026-01-12T12:30:00.000Z',
          }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateUserGroupSessionMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        endsAt: '2026-01-12T14:00:00.000Z',
        descriptionJson: {
          content: [
            {
              content: [{ text: 'Updated notes', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        scope: 'once',
        startsAt: '2026-01-12T12:30:00.000Z',
      }),
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('accepts future recurring scope with tag and file attachments', async () => {
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/user-groups/sessions/00000000-0000-0000-0000-000000000201',
        {
          body: JSON.stringify({
            files: [{ storagePath: 'user-groups/group-1/slides.pdf' }],
            scope: 'future',
            tagNames: ['Advanced'],
          }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: '00000000-0000-0000-0000-000000000201',
          wsId: '00000000-0000-0000-0000-000000000001',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateUserGroupSessionMock).toHaveBeenCalledWith({
      payload: {
        files: [{ storagePath: 'user-groups/group-1/slides.pdf' }],
        scope: 'future',
        tagNames: ['Advanced'],
      },
      sessionId: '00000000-0000-0000-0000-000000000201',
      supabase: { admin: true },
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });
});
