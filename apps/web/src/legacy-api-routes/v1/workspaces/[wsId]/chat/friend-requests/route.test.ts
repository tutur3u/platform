import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
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
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to create friend request' },
      { status: 500 }
    ),
  getChatRpcErrorStatus: (error: { message?: string }) =>
    /not_found|not found/u.test(error.message ?? '') ? 404 : 500,
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

function routeContext() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request(email: string) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/friend-requests',
    {
      body: JSON.stringify({ email }),
      method: 'POST',
    }
  );
}

describe('chat friend requests route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
      },
      ok: true,
    });
  });

  it('returns a generic queued response for existing recipients', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue({ queued: true });

    const { POST } = await import('./route.js');
    const response = await POST(
      request('friend@example.com') as never,
      routeContext()
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ queued: true });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_create_friend_request_by_email',
      {
        p_actor_user_id: 'user-1',
        p_email: 'friend@example.com',
        p_ws_id: 'workspace-1',
      }
    );
  });

  it('returns the same generic response when the old RPC reports not found', async () => {
    mocks.callPrivateChatRpc.mockRejectedValue({
      message: 'chat_friend_user_not_found',
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      request('missing@example.com') as never,
      routeContext()
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ queued: true });
  });
});
