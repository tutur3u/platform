import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const serverLoggerErrorMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

const sessionSupabase = { from: vi.fn() };
const sessionUser = {
  id: '00000000-0000-4000-8000-000000000999',
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createThenableQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => {
      throw new Error('Existing share lookups should not use maybeSingle');
    }),
    select: vi.fn(() => query),
  };
  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

let taskBoardSharesTable: {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
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

import { POST } from './route';

describe('task board shares route POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-4000-8000-000000000123'
    );
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
    });

    const boardQuery = {
      eq: vi.fn(() => boardQuery),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: '00000000-0000-4000-8000-000000000456',
          ws_id: '00000000-0000-4000-8000-000000000123',
        },
        error: null,
      }),
      select: vi.fn(() => boardQuery),
    };

    const targetUserQuery = {
      eq: vi.fn(() => targetUserQuery),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
      select: vi.fn(() => targetUserQuery),
    };

    const existingShareQuery = createThenableQuery({
      data: [],
      error: null,
    });

    const savedShareRow = {
      created_at: '2026-05-30T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000777',
      permission: 'view',
      shared_with_email: 'guest@example.com',
      shared_with_user_id: null,
      users: null,
    };
    const saveShareSelection = {
      maybeSingle: vi.fn().mockResolvedValue({
        data: savedShareRow,
        error: null,
      }),
    };
    const saveShareQuery = {
      select: vi.fn(() => saveShareSelection),
    };
    taskBoardSharesTable = {
      insert: vi.fn(() => saveShareQuery),
      select: vi.fn(() => existingShareQuery),
    };

    const fromMock = vi.fn((table: string) => {
      if (table === 'workspace_boards') {
        return { select: boardQuery.select };
      }

      if (table === 'user_private_details') {
        return { select: targetUserQuery.select };
      }

      if (table === 'task_board_shares') {
        return taskBoardSharesTable;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
    });
  });

  it('creates an email board share when no existing share is found', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards/00000000-0000-4000-8000-000000000456/shares',
        {
          body: JSON.stringify({
            email: 'Guest@Example.com',
            permission: 'view',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          boardId: '00000000-0000-4000-8000-000000000456',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      share: {
        created_at: '2026-05-30T00:00:00.000Z',
        email: 'guest@example.com',
        id: '00000000-0000-4000-8000-000000000777',
        permission: 'view',
        user: null,
        user_id: null,
      },
    });
    expect(taskBoardSharesTable.select).toHaveBeenCalledWith('id');
    const lookupQuery = taskBoardSharesTable.select.mock.results[0]?.value;
    expect(lookupQuery.limit).toHaveBeenCalledWith(1);
    expect(lookupQuery.maybeSingle).not.toHaveBeenCalled();
    expect(taskBoardSharesTable.insert).toHaveBeenCalledWith({
      board_id: '00000000-0000-4000-8000-000000000456',
      permission: 'view',
      shared_by_user_id: '00000000-0000-4000-8000-000000000999',
      shared_with_email: 'guest@example.com',
      shared_with_user_id: null,
    });
    const saveShareQuery = taskBoardSharesTable.insert.mock.results[0]?.value;
    expect(saveShareQuery.select).toHaveBeenCalledWith(
      expect.stringContaining('users:shared_with_user_id')
    );
  });
});
