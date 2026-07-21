import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  user: {
    email: 'member@example.com',
    id: 'user-1',
  },
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

describe('tasks user config route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.user.email = 'member@example.com';
  });

  it('serves task user preferences locally with tasks app-session auth', async () => {
    const query = createValueQuery({ value: 'compact' });
    mocks.supabase.from.mockReturnValue(query);

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'https://tasks.tuturuuu.com/api/v1/users/me/configs/TASK_DIALOG_DEFAULT_PRESENTATION'
      ),
      {
        params: Promise.resolve({
          configId: 'TASK_DIALOG_DEFAULT_PRESENTATION',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: 'compact' });
    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        allowAppSessionAuth: { targetApp: 'tasks' },
      })
    );
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_configs');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith(
      'id',
      'TASK_DIALOG_DEFAULT_PRESENTATION'
    );
  });

  it('deletes nullable task user preferences locally', async () => {
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      error: null,
    };
    mocks.supabase.from.mockReturnValue(query);

    const { PUT } = await import('./route');
    const response = await PUT(
      new NextRequest(
        'https://tasks.tuturuuu.com/api/v1/users/me/configs/TASK_DRAFT_MODE_ENABLED',
        {
          body: JSON.stringify({ value: null }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          configId: 'TASK_DRAFT_MODE_ENABLED',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_configs');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'TASK_DRAFT_MODE_ENABLED');
  });
});
