import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();
const authMocks = vi.hoisted(() => ({ withSessionAuth: vi.fn() }));

const sessionSupabase = { from: vi.fn() };
const sessionUser = { id: '00000000-0000-4000-8000-000000000999' };

const BOARD_ID = '00000000-0000-4000-8000-000000000456';
const WS_ID = '00000000-0000-4000-8000-000000000123';
const mutationEqCalls: Array<[string, unknown]> = [];
const updateMock = vi.fn();

function createThenableMutationQuery() {
  const query = {
    eq: vi.fn((field: string, value: unknown) => {
      mutationEqCalls.push([field, value]);
      return query;
    }),
  };
  Object.defineProperty(query, 'then', {
    value: (resolve: (value: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  });
  return query;
}

function createBoardCheckQuery(archivedAt: string | null) {
  const query = {
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({
      data: {
        archived_at: archivedAt,
        deleted_at: null,
        id: BOARD_ID,
      },
      error: null,
    }),
  };
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
  ) => verifyWorkspaceMembershipTypeMock(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: authMocks.withSessionAuth.mockImplementation(
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
      }
  ),
}));

import { DELETE, POST } from './route';

function createRequest(method: 'DELETE' | 'POST') {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/personal/boards/${BOARD_ID}/archive`,
    { method }
  );
}

const routeContext = {
  params: Promise.resolve({ boardId: BOARD_ID, wsId: 'personal' }),
};

describe('workspace boards/[boardId]/archive route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationEqCalls.length = 0;
    normalizeWorkspaceIdMock.mockResolvedValue(WS_ID);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  it('accepts configured app sessions for archive mutations', async () => {
    vi.resetModules();
    authMocks.withSessionAuth.mockClear();

    await import('./route');

    expect(authMocks.withSessionAuth).toHaveBeenCalledTimes(2);
    for (const call of authMocks.withSessionAuth.mock.calls) {
      expect(call).toEqual([
        expect.any(Function),
        {
          allowAppSessionAuth: {
            targetApp: ['platform', 'calendar', 'tasks'],
          },
        },
      ]);
    }
  });

  it.each([
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)(
    'rejects %s when the user is not a workspace member',
    async (method, handler) => {
      verifyWorkspaceMembershipTypeMock.mockResolvedValueOnce({ ok: false });

      const response = await handler(createRequest(method), routeContext);

      expect(response.status).toBe(403);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['POST', POST, null, { archived_at: expect.any(String) }],
    ['DELETE', DELETE, '2026-08-13T00:00:00.000Z', { archived_at: null }],
  ] as const)(
    'normalizes workspace aliases and scopes %s admin mutations',
    async (method, handler, archivedAt, expectedUpdate) => {
      const fromMock = vi.fn(() => ({
        select: vi.fn(() => createBoardCheckQuery(archivedAt)),
        update: updateMock,
      }));
      updateMock.mockImplementation(() => createThenableMutationQuery());
      createAdminClientMock.mockResolvedValue({ from: fromMock });

      const response = await handler(createRequest(method), routeContext);

      expect(response.status).toBe(200);
      expect(normalizeWorkspaceIdMock).toHaveBeenCalledWith(
        'personal',
        sessionSupabase
      );
      expect(updateMock).toHaveBeenCalledWith(expectedUpdate);
      expect(mutationEqCalls).toContainEqual(['id', BOARD_ID]);
      expect(mutationEqCalls).toContainEqual(['ws_id', WS_ID]);
    }
  );
});
