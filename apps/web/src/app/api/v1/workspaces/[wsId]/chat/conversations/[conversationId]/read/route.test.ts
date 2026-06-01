import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  chatRpcErrorResponse: vi.fn(),
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
  chatRpcErrorResponse: (
    ...args: Parameters<typeof mocks.chatRpcErrorResponse>
  ) => mocks.chatRpcErrorResponse(...args),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

const conversation = {
  aiEnabled: false,
  archivedAt: null,
  createdAt: '2026-06-01T08:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: '0751d168-30a9-450b-a841-863e0fa805df',
  latestMessage: null,
  memberCount: 1,
  members: [],
  metadata: {},
  title: 'General',
  type: 'channel',
  unreadCount: 0,
  updatedAt: '2026-06-01T08:00:00.000Z',
  wsId: 'workspace-1',
};

function createRequest(messageId: string | null) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/0751d168-30a9-450b-a841-863e0fa805df/read',
    {
      body: JSON.stringify({ messageId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

function createRouteContext() {
  return {
    params: Promise.resolve({
      conversationId: '0751d168-30a9-450b-a841-863e0fa805df',
      wsId: 'workspace-1',
    }),
  };
}

describe('chat read state route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.chatRpcErrorResponse.mockReturnValue(
      Response.json(
        { message: 'Failed to update chat read state' },
        { status: 500 }
      )
    );
  });

  it('retries with a null message anchor when the persisted message id is stale', async () => {
    const staleMessageId = '11111111-1111-4111-8111-111111111111';
    mocks.callPrivateChatRpc
      .mockRejectedValueOnce({
        code: '22023',
        message: 'chat_read_message_not_found',
      })
      .mockResolvedValueOnce(conversation);

    const { POST } = await import('./route');
    const response = await POST(
      createRequest(staleMessageId) as never,
      createRouteContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ conversation });
    expect(mocks.callPrivateChatRpc).toHaveBeenNthCalledWith(
      1,
      'chat_set_read_state',
      {
        p_actor_user_id: 'user-1',
        p_conversation_id: '0751d168-30a9-450b-a841-863e0fa805df',
        p_message_id: staleMessageId,
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.callPrivateChatRpc).toHaveBeenNthCalledWith(
      2,
      'chat_set_read_state',
      {
        p_actor_user_id: 'user-1',
        p_conversation_id: '0751d168-30a9-450b-a841-863e0fa805df',
        p_message_id: null,
        p_ws_id: 'workspace-1',
      }
    );
  });

  it('keeps non-stale RPC failures on the normal error path', async () => {
    const rpcError = {
      code: '22023',
      message: 'chat_manage_permission_required',
    };
    mocks.callPrivateChatRpc.mockRejectedValueOnce(rpcError);

    const { POST } = await import('./route');
    const response = await POST(
      createRequest('11111111-1111-4111-8111-111111111111') as never,
      createRouteContext()
    );

    expect(response.status).toBe(500);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.chatRpcErrorResponse).toHaveBeenCalledWith(
      rpcError,
      'Failed to update chat read state'
    );
  });
});
