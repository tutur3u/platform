import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSessionTokenFromRequest: vi.fn(),
  handleTaskDetailRouteDELETE: vi.fn(),
  handleTaskDetailRouteGET: vi.fn(),
  handleTaskDetailRoutePATCH: vi.fn(),
  handleTaskDetailRoutePUT: vi.fn(),
  handleTaskRouteGET: vi.fn(),
  handleTaskRoutePOST: vi.fn(),
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
        params: Record<string, string>
      ) => unknown
    ) =>
      async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: { from: vi.fn() }, user: { id: 'user-1' } },
          routeContext?.params
            ? await routeContext.params
            : { wsId: 'personal' }
        )
  ),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
}));

vi.mock('@tuturuuu/apis/tu-do/tasks/route', () => ({
  handleTaskRouteGET: mocks.handleTaskRouteGET,
  handleTaskRoutePOST: mocks.handleTaskRoutePOST,
}));

vi.mock('@tuturuuu/apis/tu-do/tasks/taskId/route', () => ({
  handleTaskDetailRouteDELETE: mocks.handleTaskDetailRouteDELETE,
  handleTaskDetailRouteGET: mocks.handleTaskDetailRouteGET,
  handleTaskDetailRoutePATCH: mocks.handleTaskDetailRoutePATCH,
  handleTaskDetailRoutePUT: mocks.handleTaskDetailRoutePUT,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('workspace task API route app-session bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handleTaskDetailRouteDELETE.mockResolvedValue(
      Response.json({ ok: true })
    );
    mocks.handleTaskDetailRouteGET.mockResolvedValue(
      Response.json({ ok: true })
    );
    mocks.handleTaskDetailRoutePATCH.mockResolvedValue(
      Response.json({ ok: true })
    );
    mocks.handleTaskDetailRoutePUT.mockResolvedValue(
      Response.json({ ok: true })
    );
    mocks.handleTaskRouteGET.mockResolvedValue(Response.json({ ok: true }));
    mocks.handleTaskRoutePOST.mockResolvedValue(Response.json({ ok: true }));
    mocks.withSessionAuth.mockImplementation(
      (
        handler: (
          request: NextRequest,
          context: { supabase: typeof mocks.supabase; user: typeof mocks.user },
          params: Record<string, string>
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
    );
  });

  it('requires platform CLI app-session auth on task routes', async () => {
    await import('@/app/api/v1/workspaces/[wsId]/tasks/route');

    expect(mocks.withSessionAuth).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {
        allowAppSessionAuth: {
          requiredScope: 'cli:access',
          targetApp: 'platform',
        },
      }
    );
    expect(mocks.withSessionAuth).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {
        allowAppSessionAuth: {
          requiredScope: 'cli:access',
          targetApp: 'platform',
        },
      }
    );
  });

  it('passes app-session auth context into the shared task GET handler', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_access');

    const route = await import('@/app/api/v1/workspaces/[wsId]/tasks/route');
    const response = await route.GET(
      new NextRequest('http://localhost/api/v1/workspaces/personal/tasks', {
        headers: { Authorization: 'Bearer ttr_app_access' },
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.handleTaskRouteGET).toHaveBeenCalledTimes(1);
    const call = mocks.handleTaskRouteGET.mock.calls[0];
    expect(call).toBeDefined();
    const [, context, auth] = call as [
      NextRequest,
      { params: Promise<{ wsId: string }> },
      {
        appSession: boolean;
        supabase: typeof mocks.supabase;
        user: typeof mocks.user;
      },
    ];
    await expect(context.params).resolves.toEqual({ wsId: 'personal' });
    expect(auth).toMatchObject({
      appSession: true,
      supabase: mocks.supabase,
      user: mocks.user,
    });
  });

  it('passes app-session auth context into the shared task detail GET handler', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_access');

    const route = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/[taskId]/route'
    );
    const response = await route.GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/tasks/task-1',
        {
          headers: { Authorization: 'Bearer ttr_app_access' },
        }
      ),
      { params: Promise.resolve({ taskId: 'task-1', wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.handleTaskDetailRouteGET).toHaveBeenCalledTimes(1);
    const call = mocks.handleTaskDetailRouteGET.mock.calls[0];
    expect(call).toBeDefined();
    const [, context, auth] = call as [
      NextRequest,
      { params: Promise<{ taskId: string; wsId: string }> },
      {
        appSession: boolean;
        supabase: typeof mocks.supabase;
        user: typeof mocks.user;
      },
    ];
    await expect(context.params).resolves.toEqual({
      taskId: 'task-1',
      wsId: 'personal',
    });
    expect(auth).toMatchObject({
      appSession: true,
      supabase: mocks.supabase,
      user: mocks.user,
    });
  });
});
