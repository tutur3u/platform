import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

const sessionSupabase = { from: vi.fn() };
const sessionUser = {
  id: '00000000-0000-4000-8000-000000000999',
};

const BOARD_ID = '00000000-0000-4000-8000-000000000456';
const WS_ID = '00000000-0000-4000-8000-000000000123';

const boardCheckResults: Array<{ data: unknown; error: unknown }> = [];
const mutationEqCalls: Array<[string, unknown]> = [];
const mutationResults: Array<{ error: unknown }> = [];
const deleteMock = vi.fn();
const updateMock = vi.fn();

function createThenableMutationQuery() {
  const query = {
    eq: vi.fn((field: string, value: unknown) => {
      mutationEqCalls.push([field, value]);
      return query;
    }),
  };
  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: { error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve(mutationResults.shift() ?? { error: null }).then(
        resolve,
        reject
      ),
  });

  return query;
}

function createBoardCheckQuery() {
  const query = {
    eq: vi.fn(() => query),
    single: vi.fn(() =>
      Promise.resolve(
        boardCheckResults.shift() ?? {
          data: {
            deleted_at: null,
            id: BOARD_ID,
          },
          error: null,
        }
      )
    ),
  };

  return query;
}

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

import { DELETE, PATCH, PUT } from './route';

function createRequest(
  method: 'DELETE' | 'PATCH' | 'PUT',
  body?: Record<string, unknown>
) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/boards/${BOARD_ID}`,
    {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      method,
    }
  );
}

const routeContext = {
  params: Promise.resolve({
    boardId: BOARD_ID,
    wsId: WS_ID,
  }),
};

describe('workspace boards/[boardId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardCheckResults.length = 0;
    mutationEqCalls.length = 0;
    mutationResults.length = 0;

    normalizeWorkspaceIdMock.mockResolvedValue(WS_ID);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
    });

    const fromMock = vi.fn((table: string) => {
      if (table !== 'workspace_boards') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        delete: deleteMock,
        select: vi.fn(() => createBoardCheckQuery()),
        update: updateMock,
      };
    });

    deleteMock.mockImplementation(() => createThenableMutationQuery());
    updateMock.mockImplementation(() => createThenableMutationQuery());
    createAdminClientMock.mockResolvedValue({ from: fromMock });
  });

  it.each([
    ['PUT', PUT, undefined],
    ['PATCH', PATCH, { restore: true }],
    ['DELETE', DELETE, undefined],
  ] as const)('rejects %s for a workspace member without manage_projects', async (method, handler, body) => {
    getPermissionsMock.mockResolvedValueOnce({
      containsPermission: (permission: string) =>
        permission !== 'manage_projects',
    });

    const response = await handler(createRequest(method, body), routeContext);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You don't have permission to perform this operation",
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('keeps soft-delete admin mutations scoped to the workspace', async () => {
    const response = await PUT(createRequest('PUT'), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({
      deleted_at: expect.any(String),
    });
    expect(mutationEqCalls).toContainEqual(['id', BOARD_ID]);
    expect(mutationEqCalls).toContainEqual(['ws_id', WS_ID]);
  });

  it('keeps restore admin mutations scoped to the workspace', async () => {
    boardCheckResults.push({
      data: {
        deleted_at: '2026-05-30T00:00:00.000Z',
        id: BOARD_ID,
      },
      error: null,
    });

    const response = await PATCH(
      createRequest('PATCH', { restore: true }),
      routeContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null });
    expect(mutationEqCalls).toContainEqual(['id', BOARD_ID]);
    expect(mutationEqCalls).toContainEqual(['ws_id', WS_ID]);
  });

  it('keeps permanent-delete admin mutations scoped to the workspace', async () => {
    boardCheckResults.push({
      data: {
        deleted_at: '2026-05-30T00:00:00.000Z',
        id: BOARD_ID,
      },
      error: null,
    });

    const response = await DELETE(createRequest('DELETE'), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(mutationEqCalls).toContainEqual(['id', BOARD_ID]);
    expect(mutationEqCalls).toContainEqual(['ws_id', WS_ID]);
  });
});
