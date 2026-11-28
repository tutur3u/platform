import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: { supabase: null as unknown, user: { id: 'user-1' } },
  callPrivateChatRpc: vi.fn(),
  resolveChatRouteContext: vi.fn(),
};

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: (error: { code?: string }) =>
    Response.json(
      { message: 'failed' },
      { status: error.code === '22023' ? 400 : 500 }
    ),
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

const TARGET = '77777777-7777-4777-8777-777777777777';

describe('chat blocks routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'ws-1' },
      ok: true,
    });
  });

  it('lists only the session user blocks', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce([
      { userId: TARGET, displayName: 'Nam', avatarUrl: null, createdAt: 'x' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws/chat/blocks') as never,
      { params: Promise.resolve({ wsId: 'ws' }) }
    );

    await expect(response.json()).resolves.toEqual({
      blocks: [
        { userId: TARGET, displayName: 'Nam', avatarUrl: null, createdAt: 'x' },
      ],
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_blocked_users',
      { p_actor_user_id: 'user-1' }
    );
  });

  it('blocks as the session user, ignoring any actor in the body', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce({
      blocked: true,
      userId: TARGET,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws/chat/blocks', {
        body: JSON.stringify({ userId: TARGET, blockerUserId: 'other' }),
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: 'ws' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith('chat_block_user', {
      p_actor_user_id: 'user-1',
      p_target_user_id: TARGET,
    });
  });

  it('rejects a malformed user id', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws/chat/blocks', {
        body: JSON.stringify({ userId: 'nope' }),
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: 'ws' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('refuses without chat access', async () => {
    mocks.resolveChatRouteContext.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws/chat/blocks', {
        body: JSON.stringify({ userId: TARGET }),
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: 'ws' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('unblocks as the session user', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce({ blocked: false });
    const { DELETE } = await import('./[userId]/route');
    const response = await DELETE(
      new Request(
        `http://localhost/api/v1/workspaces/ws/chat/blocks/${TARGET}`,
        { method: 'DELETE' }
      ) as never,
      { params: Promise.resolve({ userId: TARGET, wsId: 'ws' }) }
    );

    await expect(response.json()).resolves.toEqual({
      blocked: false,
      userId: TARGET,
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith('chat_unblock_user', {
      p_actor_user_id: 'user-1',
      p_target_user_id: TARGET,
    });
  });
});
