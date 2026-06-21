import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const getWorkspaceMembersMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const serverLoggerErrorMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

const sessionSupabase = { from: vi.fn() };
const sessionUser = {
  id: '00000000-0000-4000-8000-000000000999',
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
  ) => verifyWorkspaceMembershipTypeMock(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        context: { supabase: typeof sessionSupabase; user: typeof sessionUser },
        params: T
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<T> | T }
    ) => {
      const params = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as T);
      return handler(
        request,
        { supabase: sessionSupabase, user: sessionUser },
        params
      );
    },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof serverLoggerErrorMock>) =>
      serverLoggerErrorMock(...args),
  },
}));

vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: (...args: Parameters<typeof getWorkspaceMembersMock>) =>
    getWorkspaceMembersMock(...args),
}));

import { GET } from './route';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '00000000-0000-4000-8000-000000000123';

function buildRequest() {
  return new NextRequest(
    `https://app.tuturuuu.com/api/v1/workspaces/personal/task-boards/${BOARD_ID}/viewable-members`
  );
}

function routeContext() {
  return {
    params: Promise.resolve({
      boardId: BOARD_ID,
      wsId: 'personal',
    }),
  };
}

function createBoardQuery() {
  const boardQuery = {
    eq: vi.fn(() => boardQuery),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: BOARD_ID,
        ws_id: WS_ID,
      },
      error: null,
    }),
    select: vi.fn(() => boardQuery),
  };

  return boardQuery;
}

describe('task board viewable members route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(WS_ID);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
    });

    const boardQuery = createBoardQuery();
    const fromMock = vi.fn((table: string) => {
      if (table === 'workspace_boards') {
        return { select: boardQuery.select };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
    });
  });

  it('returns joined workspace members whose effective permissions can manage projects', async () => {
    getWorkspaceMembersMock.mockResolvedValue([
      {
        avatar_url: 'https://example.com/creator.png',
        default_permissions: [],
        display_name: 'Creator',
        email: 'creator@example.com',
        handle: 'creator',
        id: 'user-creator',
        is_creator: true,
        roles: [],
        workspace_member_type: 'MEMBER',
      },
      {
        avatar_url: null,
        default_permissions: [],
        display_name: 'Project Manager',
        email: 'pm@example.com',
        handle: null,
        id: 'user-manager',
        is_creator: false,
        roles: [
          {
            id: 'role-1',
            name: 'Project manager',
            permissions: [{ enabled: true, permission: 'manage_projects' }],
          },
        ],
        workspace_member_type: 'MEMBER',
      },
      {
        avatar_url: null,
        default_permissions: [{ enabled: true, permission: 'view_calendar' }],
        display_name: 'Viewer',
        email: 'viewer@example.com',
        handle: null,
        id: 'user-viewer',
        is_creator: false,
        roles: [],
        workspace_member_type: 'MEMBER',
      },
    ]);

    const response = await GET(buildRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toEqual([
      expect.objectContaining({
        display_name: 'Creator',
        email: 'creator@example.com',
        is_creator: true,
        roles: [],
        user_id: 'user-creator',
      }),
      expect.objectContaining({
        display_name: 'Project Manager',
        email: 'pm@example.com',
        is_creator: false,
        roles: [{ id: 'role-1', name: 'Project manager' }],
        user_id: 'user-manager',
      }),
    ]);
    expect(getWorkspaceMembersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'joined',
        wsId: WS_ID,
      })
    );
  });

  it('rejects non-managers before fetching viewable members', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });

    const response = await GET(buildRequest(), routeContext());

    expect(response.status).toBe(403);
    expect(getWorkspaceMembersMock).not.toHaveBeenCalled();
  });
});
