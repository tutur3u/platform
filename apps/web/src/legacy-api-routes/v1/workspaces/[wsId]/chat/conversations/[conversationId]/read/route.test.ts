import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
  blocked: new Set<string>() as Set<string> | null,
  callPrivateChatRpc: vi.fn(),
  chatRpcErrorResponse: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
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

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ scope: 'users', userIds: ['user-1'] }),
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));
vi.mock('@/lib/chat/safety', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/safety')>()),
  loadChatBlockedUserIdsForWrite: async () => mocks.blocked,
}));
vi.mock('@/lib/chat/realtime-worker', () => ({
  isChatRealtimeWorkerConfigured: () => true,
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
    mocks.blocked = new Set();
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

  it('publishes the committed read timestamp to the authorized conversation', async () => {
    const lastReadAt = '2026-06-01T08:00:00.000Z';
    mocks.callPrivateChatRpc.mockResolvedValueOnce({
      ...conversation,
      members: [{ userId: 'user-1', lastReadAt }],
    });

    const { POST } = await import('./route');
    const response = await POST(
      createRequest(null) as never,
      createRouteContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      audience: { scope: 'users', userIds: ['user-1'] },
      conversationId: conversation.id,
      lastReadAt,
      type: 'read.updated',
      userId: 'user-1',
      wsId: 'workspace-1',
    });
  });

  it.each([
    ['blocked sender', new Set(['blocked-user'])],
    ['failed block lookup', null],
  ])(
    'hides the latest message for a %s after the read commits',
    async (_label, blocked) => {
      mocks.blocked = blocked;
      mocks.callPrivateChatRpc.mockResolvedValueOnce({
        ...conversation,
        latestMessage: {
          content: 'hidden',
          reactions: [],
          senderId: 'blocked-user',
        },
      });

      const { POST } = await import('./route');
      const response = await POST(
        createRequest(null) as never,
        createRouteContext()
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        conversation: { ...conversation, latestMessage: null },
      });
    }
  );

  it('hides blocked reactors on a visible latest message', async () => {
    mocks.blocked = new Set(['blocked-user']);
    mocks.callPrivateChatRpc.mockResolvedValueOnce({
      ...conversation,
      latestMessage: {
        content: 'hello',
        reactions: [
          { count: 2, emoji: 'x', userIds: ['blocked-user', 'friend'] },
        ],
        senderId: 'friend',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      createRequest(null) as never,
      createRouteContext()
    );

    await expect(response.json()).resolves.toMatchObject({
      conversation: {
        latestMessage: {
          reactions: [{ count: 1, emoji: 'x', userIds: ['friend'] }],
        },
      },
    });
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
