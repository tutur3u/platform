import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const getAppSessionTokenFromRequestMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const verifyAppSessionRequestMock = vi.fn();
const verifyCliAccessTokenMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();
const taskBoardShareResults: Array<{ data: unknown; error: unknown }> = [];

function createThenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (supabase: unknown) => supabase,
  createAppSessionUser: (claims: { email?: string | null; sub: string }) => ({
    aud: 'authenticated',
    email: claims.email ?? undefined,
    id: claims.sub,
  }),
  getAppSessionTokenFromRequest: (
    ...args: Parameters<typeof getAppSessionTokenFromRequestMock>
  ) => getAppSessionTokenFromRequestMock(...args),
  verifyAppSessionRequest: (
    ...args: Parameters<typeof verifyAppSessionRequestMock>
  ) => verifyAppSessionRequestMock(...args),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: (
    ...args: Parameters<typeof verifyCliAccessTokenMock>
  ) => verifyCliAccessTokenMock(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    normalizeWorkspaceId: (
      ...args: Parameters<typeof normalizeWorkspaceIdMock>
    ) => normalizeWorkspaceIdMock(...args),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
    ) => verifyWorkspaceMembershipTypeMock(...args),
  };
});

import { requireBoardAccess } from './access';

describe('task board list access', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_access');
    verifyAppSessionRequestMock.mockReturnValue({ ok: false });
    verifyCliAccessTokenMock.mockReturnValue({
      claims: {
        email: 'agent@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    normalizeWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-4000-8000-000000000123'
    );
    taskBoardShareResults.length = 0;

    const personalWorkspaceQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '00000000-0000-4000-8000-000000000123' },
        error: null,
      }),
    };
    personalWorkspaceQuery.eq.mockReturnValue(personalWorkspaceQuery);

    const boardQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: '00000000-0000-4000-8000-000000000456',
          ws_id: '00000000-0000-4000-8000-000000000123',
        },
        error: null,
      }),
    };
    boardQuery.eq.mockReturnValue(boardQuery);

    const fromMock = vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => personalWorkspaceQuery),
        };
      }

      if (table === 'workspace_boards') {
        return {
          select: vi.fn(() => boardQuery),
        };
      }

      if (table === 'task_board_shares') {
        return createThenableQuery(
          taskBoardShareResults.shift() ?? { data: [], error: null }
        );
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createAdminClientMock.mockResolvedValue({ from: fromMock });
  });

  it('resolves personal board access from a CLI app-session token', async () => {
    const access = await requireBoardAccess(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards/00000000-0000-4000-8000-000000000456/lists',
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        boardId: '00000000-0000-4000-8000-000000000456',
        wsId: 'personal',
      }
    );

    expect('error' in access).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '00000000-0000-4000-8000-000000000999',
        wsId: '00000000-0000-4000-8000-000000000123',
      })
    );
  });

  it('resolves personal board access from a Tasks app-session token', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_tasks');
    verifyAppSessionRequestMock.mockReturnValue({
      claims: {
        email: 'tasks-user@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });

    const access = await requireBoardAccess(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards/00000000-0000-4000-8000-000000000456/lists',
        {
          headers: {
            cookie: 'tuturuuu_app_session=ttr_app_tasks',
          },
        }
      ),
      {
        boardId: '00000000-0000-4000-8000-000000000456',
        wsId: 'personal',
      }
    );

    expect('error' in access).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(verifyCliAccessTokenMock).not.toHaveBeenCalled();
    expect(verifyAppSessionRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { targetApp: ['calendar', 'tasks'] }
    );
  });

  it('allows a directly shared board guest to read lists', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: false });
    taskBoardShareResults.push(
      { data: [], error: null },
      {
        data: [
          {
            id: '00000000-0000-4000-8000-000000000777',
            board_id: '00000000-0000-4000-8000-000000000456',
            permission: 'view',
            shared_with_email: 'agent@example.com',
            workspace_boards: {
              id: '00000000-0000-4000-8000-000000000456',
              ws_id: '00000000-0000-4000-8000-000000000123',
            },
          },
        ],
        error: null,
      }
    );

    const access = await requireBoardAccess(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards/00000000-0000-4000-8000-000000000456/lists',
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        boardId: '00000000-0000-4000-8000-000000000456',
        wsId: 'personal',
      }
    );

    expect('error' in access).toBe(false);
    expect(access).toMatchObject({
      access: { mode: 'guest', permission: 'view' },
    });
  });

  it('rejects view-only board guests when list mutation requires edit', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: false });
    taskBoardShareResults.push(
      { data: [], error: null },
      {
        data: [
          {
            id: '00000000-0000-4000-8000-000000000777',
            board_id: '00000000-0000-4000-8000-000000000456',
            permission: 'view',
            shared_with_email: 'agent@example.com',
            workspace_boards: {
              id: '00000000-0000-4000-8000-000000000456',
              ws_id: '00000000-0000-4000-8000-000000000123',
            },
          },
        ],
        error: null,
      }
    );

    const access = await requireBoardAccess(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards/00000000-0000-4000-8000-000000000456/lists',
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        boardId: '00000000-0000-4000-8000-000000000456',
        wsId: 'personal',
      },
      { requiredPermission: 'edit' }
    );

    expect(access).toMatchObject({
      error: expect.objectContaining({ status: 403 }),
    });
  });
});
