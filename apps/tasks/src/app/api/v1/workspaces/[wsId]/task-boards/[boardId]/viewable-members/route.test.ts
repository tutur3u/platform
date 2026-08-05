import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const resolveTaskBoardAccessMock = vi.fn();
const rpcMock = vi.fn();

const sessionSupabase = { from: vi.fn() };
const sessionUser = {
  id: '00000000-0000-4000-8000-000000000999',
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
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
    rpcMock.mockResolvedValue({ data: [], error: null });
    const sbAdmin = { rpc: rpcMock };
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

  it('returns every joined member with view or edit classification and excludes direct guests', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          avatar_url: 'https://example.com/creator.png',
          display_name: 'Creator',
          email: 'creator@example.com',
          handle: 'creator',
          user_id: 'user-creator',
          is_creator: true,
          permission: 'edit',
          roles: [],
          workspace_member_type: 'MEMBER',
        },
        {
          avatar_url: null,
          display_name: 'Project Manager',
          email: 'pm@example.com',
          handle: null,
          user_id: 'user-manager',
          is_creator: false,
          permission: 'edit',
          roles: [
            {
              id: 'role-1',
              name: 'Project manager',
            },
          ],
          workspace_member_type: 'MEMBER',
        },
        {
          avatar_url: null,
          display_name: 'Viewer',
          email: 'viewer@example.com',
          handle: null,
          user_id: 'user-viewer',
          is_creator: false,
          permission: 'view',
          roles: [],
          workspace_member_type: 'MEMBER',
        },
      ],
      error: null,
    });

    const response = await GET(buildRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toEqual([
      expect.objectContaining({
        display_name: 'Creator',
        email: 'creator@example.com',
        is_creator: true,
        permission: 'edit',
        roles: [],
        user_id: 'user-creator',
      }),
      expect.objectContaining({
        display_name: 'Project Manager',
        email: 'pm@example.com',
        is_creator: false,
        permission: 'edit',
        roles: [{ id: 'role-1', name: 'Project manager' }],
        user_id: 'user-manager',
      }),
      expect.objectContaining({
        display_name: 'Viewer',
        email: 'viewer@example.com',
        permission: 'view',
        roles: [],
        user_id: 'user-viewer',
        workspace_member_type: 'MEMBER',
      }),
    ]);
    expect(resolveTaskBoardAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: BOARD_ID,
        requiredPermission: 'view',
        wsId: WS_ID,
      })
    );
    expect(rpcMock).toHaveBeenCalledWith('get_task_board_workspace_members', {
      p_ws_id: WS_ID,
    });
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
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
