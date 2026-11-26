import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
  deleteExternalChatMessageIfBound: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  userId: 'sender',
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(
        request,
        { supabase: null, user: { id: mocks.userId } },
        await routeContext?.params
      ),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  deleteAiChatMessage: vi.fn(),
  isAiChatConversationId: () => false,
}));

vi.mock('@/lib/chat/private-rpc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/private-rpc')>(
    '@/lib/chat/private-rpc'
  );
  return {
    callPrivateChatRpc: (...args: unknown[]) =>
      mocks.callPrivateChatRpc(...args),
    chatRpcErrorResponse: actual.chatRpcErrorResponse,
    resolveChatRouteContext: (...args: unknown[]) =>
      mocks.resolveChatRouteContext(...args),
  };
});

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  getChatRealtimeUserAudience: () => ({}),
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  deleteExternalChatMessageIfBound: (...args: unknown[]) =>
    mocks.deleteExternalChatMessageIfBound(...args),
  isExternalChatConversation: vi.fn(),
}));

/** Rows as `private.chat_delete_message` sees them. */
const messages = [
  {
    conversationId: 'conversation-1',
    id: 'own-message',
    senderId: 'sender',
    wsId: 'workspace-1',
  },
  {
    conversationId: 'conversation-1',
    id: 'visitor-message',
    senderId: null,
    wsId: 'workspace-1',
  },
  {
    conversationId: 'conversation-2',
    id: 'other-conversation-message',
    senderId: 'sender',
    wsId: 'workspace-1',
  },
  {
    conversationId: 'foreign-conversation',
    id: 'foreign-message',
    senderId: 'sender',
    wsId: 'workspace-2',
  },
];
const participants: Record<string, string[]> = {
  'conversation-1': ['sender', 'member', 'moderator'],
  'conversation-2': ['sender'],
  'foreign-conversation': ['sender', 'member', 'moderator'],
  'private-conversation': ['someone-else'],
};
const moderators = new Set(['moderator']);

type DeleteArgs = {
  p_actor_user_id: string;
  p_conversation_id: string;
  p_message_id: string;
  p_ws_id: string;
};

/** The rule `private.chat_delete_message` enforces, in its order. */
function chatDeleteMessage(args: DeleteArgs) {
  if (!participants[args.p_conversation_id]?.includes(args.p_actor_user_id)) {
    throw { code: '42501', message: 'chat_conversation_forbidden' };
  }
  const row = messages.find(
    (message) =>
      message.id === args.p_message_id &&
      message.conversationId === args.p_conversation_id &&
      message.wsId === args.p_ws_id
  );
  if (!row) throw { code: '22023', message: 'chat_message_not_found' };
  if (
    row.senderId !== args.p_actor_user_id &&
    !moderators.has(args.p_actor_user_id)
  ) {
    throw { code: '42501', message: 'chat_message_owner_required' };
  }
  return { ...row, deletedAt: '2026-11-26T09:00:00.000Z' };
}

async function callDelete(conversationId: string, messageId: string) {
  const { DELETE } = await import('./route');
  return DELETE(new Request('http://localhost') as never, {
    params: Promise.resolve({
      conversationId,
      messageId,
      wsId: 'workspace-1',
    }),
  });
}

describe('chat message deletion with a connected site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.userId = 'sender';
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.deleteExternalChatMessageIfBound.mockResolvedValue(true);
    mocks.callPrivateChatRpc.mockImplementation(
      async (name: string, args: DeleteArgs) => {
        if (name === 'chat_delete_message') return chatDeleteMessage(args);
        if (name === 'chat_get_conversation') {
          return { id: args.p_conversation_id, members: [], type: 'channel' };
        }
        throw new Error(`Unexpected RPC ${name}`);
      }
    );
  });

  it('refuses a member who is neither sender nor moderator, remotely too', async () => {
    mocks.userId = 'member';

    const response = await callDelete('conversation-1', 'visitor-message');

    expect(response.status).toBe(403);
    expect(mocks.deleteExternalChatMessageIfBound).not.toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  it('lets the sender delete, then tells the connected site', async () => {
    const response = await callDelete('conversation-1', 'own-message');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: expect.objectContaining({ id: 'own-message' }),
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledBefore(
      mocks.deleteExternalChatMessageIfBound
    );
    expect(mocks.deleteExternalChatMessageIfBound).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'own-message',
      wsId: 'workspace-1',
    });
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.deleted' })
    );
  });

  it("lets a moderator delete a visitor's message", async () => {
    mocks.userId = 'moderator';

    const response = await callDelete('conversation-1', 'visitor-message');

    expect(response.status).toBe(200);
    expect(mocks.deleteExternalChatMessageIfBound).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'visitor-message' })
    );
  });

  it('reports a site that refuses after the native delete stands', async () => {
    mocks.deleteExternalChatMessageIfBound.mockRejectedValue(
      new Error('external_chat_control_failed:503')
    );

    const response = await callDelete('conversation-1', 'own-message');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalDelete: 'failed',
      message: { deletedAt: expect.any(String), id: 'own-message' },
    });
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.deleted' })
    );
  });

  it.each([
    [
      'a conversation in another workspace',
      'foreign-conversation',
      'foreign-message',
    ],
    [
      'a message from another conversation',
      'conversation-1',
      'other-conversation-message',
    ],
    ['an unknown message', 'conversation-1', 'missing'],
  ])(
    'finds nothing for %s and calls no site',
    async (_case, conversationId, messageId) => {
      const response = await callDelete(conversationId, messageId);

      expect(response.status).toBe(404);
      expect(mocks.deleteExternalChatMessageIfBound).not.toHaveBeenCalled();
    }
  );

  it('refuses a conversation the caller is not in', async () => {
    const response = await callDelete('private-conversation', 'own-message');

    expect(response.status).toBe(403);
    expect(mocks.deleteExternalChatMessageIfBound).not.toHaveBeenCalled();
  });

  it('refuses a workspace non-member before anything else', async () => {
    mocks.resolveChatRouteContext.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 403 }),
    });

    const response = await callDelete('conversation-1', 'own-message');

    expect(response.status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.deleteExternalChatMessageIfBound).not.toHaveBeenCalled();
  });
});
