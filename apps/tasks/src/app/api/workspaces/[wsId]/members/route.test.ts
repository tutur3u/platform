import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const deleteMembers = vi.fn();
  const getMembers = vi.fn();
  const withSessionAuth = vi.fn(
    (
      handler: (
        request: NextRequest,
        authContext: unknown,
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
      async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: { kind: 'app-session' }, user: { id: 'user-1' } },
          (await routeContext?.params) ?? { wsId: 'workspace-1' }
        )
  );

  return { deleteMembers, getMembers, withSessionAuth };
});

vi.mock('@tuturuuu/apis/members/route', () => ({
  DELETE: mocks.deleteMembers,
  GET: mocks.getMembers,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('Tasks workspace members route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMembers.mockResolvedValue(new Response(null, { status: 200 }));
    mocks.getMembers.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it('authenticates member removal with the Tasks app session', async () => {
    const { DELETE } = await import('./route');
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/api/workspaces/workspace-1/members?id=user-2',
      { method: 'DELETE' }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteMembers).toHaveBeenCalledWith(
      request,
      { params: expect.any(Promise) },
      {
        supabase: { kind: 'app-session' },
        user: { id: 'user-1' },
      }
    );
    expect(mocks.withSessionAuth).toHaveBeenCalledWith(expect.any(Function), {
      allowAppSessionAuth: { targetApp: 'tasks' },
    });
  });
});
