import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleTaskBulkRoutePOST: vi.fn(),
  legacyPost: vi.fn(),
  supabase: { from: vi.fn() },
  user: { id: 'user-1' },
  withSessionAuth: vi.fn(
    (
      handler: (
        request: NextRequest,
        context: {
          supabase: { from: ReturnType<typeof vi.fn> };
          user: { id: string };
        },
        params: { wsId: string }
      ) => unknown
    ) =>
      async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: mocks.supabase, user: mocks.user },
          routeContext?.params
            ? await routeContext.params
            : { wsId: 'personal' }
        )
  ),
}));

vi.mock('@tuturuuu/tasks-api/server/tasks/bulk/route', () => ({
  handleTaskBulkRoutePOST: mocks.handleTaskBulkRoutePOST,
  POST: mocks.legacyPost,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('workspace task bulk route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handleTaskBulkRoutePOST.mockResolvedValue(
      Response.json({ successCount: 1 })
    );
  });

  it('uses Tasks app-session auth and injects the resolved actor', async () => {
    const route = await import('./route');
    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/personal/tasks/bulk',
      {
        body: JSON.stringify({
          operation: {
            type: 'update_fields',
            updates: { end_date: '2026-07-13T16:59:59.999Z' },
          },
          taskIds: ['22222222-2222-4222-8222-222222222222'],
        }),
        headers: { Authorization: 'Bearer task_app_access' },
        method: 'POST',
      }
    );

    const response = await route.POST(request, {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.withSessionAuth).toHaveBeenCalledWith(expect.any(Function), {
      allowAppSessionAuth: {
        targetApp: ['platform', 'calendar', 'tasks'],
      },
    });
    expect(mocks.handleTaskBulkRoutePOST).toHaveBeenCalledTimes(1);

    const [, context, auth] = mocks.handleTaskBulkRoutePOST.mock.calls[0] as [
      NextRequest,
      { params: Promise<{ wsId: string }> },
      {
        supabase: typeof mocks.supabase;
        user: typeof mocks.user;
      },
    ];

    await expect(context.params).resolves.toEqual({ wsId: 'personal' });
    expect(auth).toEqual({
      supabase: mocks.supabase,
      user: mocks.user,
    });
  });
});
