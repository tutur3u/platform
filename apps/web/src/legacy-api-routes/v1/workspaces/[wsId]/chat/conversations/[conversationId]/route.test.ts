import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: {},
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
};

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        auth: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to update conversation' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  archiveAiChatConversation: vi.fn(),
  isAiChatConversationId: vi.fn(() => false),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  getChatRealtimeUserAudience: () => ({ userId: 'user-1' }),
  publishChatRealtimeEvent: (
    ...args: Parameters<typeof mocks.publishChatRealtimeEvent>
  ) => mocks.publishChatRealtimeEvent(...args),
}));

const conversation = {
  id: 'conversation-1',
  memberCount: 1,
  members: [],
  title: 'Studio',
  type: 'direct',
  wsId: 'workspace-1',
};

const mutedConversation = {
  ...conversation,
  members: [{ mutedAt: '2026-11-20T01:50:00.000Z', userId: 'user-1' }],
};

async function callPatch(body: unknown) {
  const { PATCH } = await import('./route');
  return PATCH(
    new Request('http://localhost/conversation', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }) as never,
    {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    }
  );
}

describe('chat conversation patch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_update_conversation') return conversation;
      if (name === 'chat_set_own_mute') return mutedConversation;
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it('mutes through the actor RPC and leaves the conversation update alone', async () => {
    const response = await callPatch({ muted: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversation: mutedConversation,
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith('chat_set_own_mute', {
      p_actor_user_id: 'user-1',
      p_conversation_id: 'conversation-1',
      p_muted: true,
      p_ws_id: 'workspace-1',
    });
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: mutedConversation,
        type: 'conversation.updated',
      })
    );
  });

  it('applies a pin and then the actor mute', async () => {
    const response = await callPatch({ muted: false, pinned: true });

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc.mock.calls).toEqual([
      [
        'chat_update_conversation',
        {
          p_actor_user_id: 'user-1',
          p_conversation_id: 'conversation-1',
          p_input: { pinned: true },
          p_ws_id: 'workspace-1',
        },
      ],
      [
        'chat_set_own_mute',
        {
          p_actor_user_id: 'user-1',
          p_conversation_id: 'conversation-1',
          p_muted: false,
          p_ws_id: 'workspace-1',
        },
      ],
    ]);
  });

  it('keeps an empty patch on the conversation update', async () => {
    const response = await callPatch({});

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_update_conversation',
      expect.objectContaining({ p_input: {} })
    );
  });

  it('rejects a mute value that is not a boolean', async () => {
    const response = await callPatch({ muted: 'yes' });

    expect(response.status).toBe(400);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });
});
