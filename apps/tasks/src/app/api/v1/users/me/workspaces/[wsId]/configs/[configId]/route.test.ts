import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  supabase: { from: vi.fn() },
  user: {
    email: 'member@example.com',
    id: 'user-1',
  },
  verifyWorkspaceMembershipType: vi.fn(),
  withSessionAuth: vi.fn(
    <T>(
      handler: (
        request: NextRequest,
        auth: {
          supabase: typeof mocks.supabase;
          user: typeof mocks.user;
        },
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
          { supabase: mocks.supabase, user: mocks.user },
          params
        );
      }
  ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

function createValueQuery(data: { value: string } | null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data,
      error: null,
    })),
    select: vi.fn(() => query),
  };

  return query;
}

describe('tasks user workspace config route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('serves task workspace preferences locally with tasks app-session auth', async () => {
    const query = createValueQuery({ value: 'board-1' });
    mocks.supabase.from.mockReturnValue(query);

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'https://tasks.tuturuuu.com/api/v1/users/me/workspaces/personal/configs/TASK_DEFAULT_BOARD_ID'
      ),
      {
        params: Promise.resolve({
          configId: 'TASK_DEFAULT_BOARD_ID',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: 'board-1' });
    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        allowAppSessionAuth: { targetApp: 'tasks' },
      })
    );
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      mocks.supabase
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: mocks.supabase,
      userId: 'user-1',
      wsId: 'workspace-1',
    });
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_workspace_configs');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'TASK_DEFAULT_BOARD_ID');
  });

  it('deletes nullable task workspace preferences locally', async () => {
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      error: null,
    };
    mocks.supabase.from.mockReturnValue(query);

    const { PUT } = await import('./route');
    const response = await PUT(
      new NextRequest(
        'https://tasks.tuturuuu.com/api/v1/users/me/workspaces/workspace-1/configs/TASK_DEFAULT_BOARD_ID',
        {
          body: JSON.stringify({ value: null }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          configId: 'TASK_DEFAULT_BOARD_ID',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_workspace_configs');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'TASK_DEFAULT_BOARD_ID');
  });
});
