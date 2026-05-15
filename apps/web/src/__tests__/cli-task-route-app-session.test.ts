import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSessionTokenFromRequest: vi.fn(),
  handleTaskRouteGET: vi.fn(),
  handleTaskRoutePOST: vi.fn(),
  supabase: { from: vi.fn() },
  user: { id: 'user-1' },
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
}));

vi.mock('@tuturuuu/apis/tu-do/tasks/route', () => ({
  handleTaskRouteGET: mocks.handleTaskRouteGET,
  handleTaskRoutePOST: mocks.handleTaskRoutePOST,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: { supabase: typeof mocks.supabase; user: typeof mocks.user },
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
        routeContext?.params ? await routeContext.params : { wsId: 'personal' }
      ),
}));

describe('workspace task API route app-session bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handleTaskRouteGET.mockResolvedValue(Response.json({ ok: true }));
    mocks.handleTaskRoutePOST.mockResolvedValue(Response.json({ ok: true }));
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
});
