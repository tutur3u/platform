import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  auth: {
    supabase: null,
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
    Response.json({ message: 'Failed to send message' }, { status: 500 }),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
  toLegacyMessage: (message: unknown) => message,
}));

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/channels/channel-1/messages',
    {
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('chat channel message route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires create_chat before sending channel messages', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json(
        { message: 'Insufficient chat permissions' },
        { status: 403 }
      ),
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        channelId: 'channel-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(403);
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'create_chat',
        wsId: 'workspace-1',
      })
    );
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });
});
