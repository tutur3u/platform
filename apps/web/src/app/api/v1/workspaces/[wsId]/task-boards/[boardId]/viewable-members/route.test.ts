import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getWorkspaceMembersMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const resolveTaskBoardAccessMock = vi.fn();
const serverLoggerErrorMock = vi.fn();

const sessionSupabase = { from: vi.fn() };
const sessionUser = {
  id: '00000000-0000-4000-8000-000000000999',
};
let taskBoardShareRows: unknown[] = [];
let taskBoardSharesQuery: {
  eq: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};
let fromMock: ReturnType<typeof vi.fn>;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/apis/tu-do/board-access', () => ({
  resolveTaskBoardAccess: (
    ...args: Parameters<typeof resolveTaskBoardAccessMock>
  ) => resolveTaskBoardAccessMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
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

describe('task board viewable members route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(WS_ID);
    taskBoardShareRows = [];
    taskBoardSharesQuery = {
      eq: vi.fn(() => taskBoardSharesQuery),
      not: vi.fn(() =>
        Promise.resolve({ data: taskBoardShareRows, error: null })
      ),
      select: vi.fn(() => taskBoardSharesQuery),
    };
    fromMock = vi.fn((table: string) => {
      if (table === 'task_board_shares') return taskBoardSharesQuery;

      throw new Error(`Unexpected table: ${table}`);
    });
    const sbAdmin = { from: fromMock };
    createAdminClientMock.mockResolvedValue(sbAdmin);
    resolveTaskBoardAccessMock.mockResolvedValue({
      access: { mode: 'member', permission: 'edit' },
      board: { id: BOARD_ID, ws_id: WS_ID },
      boardId: BOARD_ID,
      sbAdmin,
      supabase: sessionSupabase,
      user: sessionUser,
      wsId: WS_ID,
    });
  });

  it('returns real users who can view the board as managers or direct board guests', async () => {
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
    taskBoardShareRows = [
      {
        shared_with_email: 'guest@example.com',
        shared_with_user_id: 'user-guest',
        users: {
          avatar_url: 'https://example.com/guest.png',
          display_name: 'Board Guest',
          handle: 'guest',
          id: 'user-guest',
        },
      },
    ];

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
      expect.objectContaining({
        display_name: 'Board Guest',
        email: 'guest@example.com',
        roles: [],
        user_id: 'user-guest',
        workspace_member_type: 'GUEST',
      }),
    ]);
    expect(resolveTaskBoardAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: BOARD_ID,
        requiredPermission: 'view',
        wsId: WS_ID,
      })
    );
    expect(getWorkspaceMembersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'joined',
        wsId: WS_ID,
      })
    );
    expect(fromMock).toHaveBeenCalledWith('task_board_shares');
    expect(taskBoardSharesQuery.eq).toHaveBeenCalledWith('board_id', BOARD_ID);
    expect(taskBoardSharesQuery.not).toHaveBeenCalledWith(
      'shared_with_user_id',
      'is',
      null
    );
  });

  it('rejects callers without board access before fetching viewable members', async () => {
    resolveTaskBoardAccessMock.mockResolvedValue({
      error: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await GET(buildRequest(), routeContext());

    expect(response.status).toBe(403);
    expect(getWorkspaceMembersMock).not.toHaveBeenCalled();
  });
});
