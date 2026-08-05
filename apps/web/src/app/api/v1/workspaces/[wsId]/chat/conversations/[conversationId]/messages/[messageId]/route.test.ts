import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
  deleteAiChatMessage: vi.fn(),
  deleteExternalChatMessageIfBound: vi.fn(),
  isAiChatConversationId: vi.fn(),
  isExternalChatConversation: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(
        request,
        { supabase: null, user: { id: 'user-1' } },
        await routeContext?.params
      ),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  deleteAiChatMessage: (...args: unknown[]) =>
    mocks.deleteAiChatMessage(...args),
  isAiChatConversationId: (...args: unknown[]) =>
    mocks.isAiChatConversationId(...args),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: (_error: unknown, fallback: string) =>
    Response.json({ message: fallback }, { status: 500 }),
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  getChatRealtimeUserAudience: () => ({ userId: 'user-1' }),
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  deleteExternalChatMessageIfBound: (...args: unknown[]) =>
    mocks.deleteExternalChatMessageIfBound(...args),
  isExternalChatConversation: (...args: unknown[]) =>
    mocks.isExternalChatConversation(...args),
}));

const message = {
  content: '',
  conversationId: 'conversation-1',
  deletedAt: '2026-08-05T07:00:00.000Z',
  id: 'message-1',
};

describe('connected chat message mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.isAiChatConversationId.mockReturnValue(false);
    mocks.isExternalChatConversation.mockResolvedValue(false);
    mocks.deleteExternalChatMessageIfBound.mockResolvedValue(false);
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_delete_message') return message;
      if (name === 'chat_get_conversation') {
        return { id: 'conversation-1', members: [], type: 'channel' };
      }
      if (name === 'chat_edit_message') return { ...message, content: 'edit' };
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it('does not mutate native chat when legacy deletion fails', async () => {
    mocks.deleteExternalChatMessageIfBound.mockRejectedValue(
      new Error('external_chat_control_failed:503')
    );
    const { DELETE } = await import('./route');

    const response = await DELETE(new Request('http://localhost') as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        messageId: 'message-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'external_delete_failed',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('deletes in legacy before mutating and publishing native chat', async () => {
    mocks.deleteExternalChatMessageIfBound.mockResolvedValue(true);
    const { DELETE } = await import('./route');

    const response = await DELETE(new Request('http://localhost') as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        messageId: 'message-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteExternalChatMessageIfBound).toHaveBeenCalledBefore(
      mocks.callPrivateChatRpc
    );
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_delete_message',
      expect.objectContaining({ p_message_id: 'message-1' })
    );
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.deleted' })
    );
  });

  it('blocks native-only edits for connected conversations', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    const { PATCH } = await import('./route');

    const response = await PATCH(
      new Request('http://localhost', {
        body: JSON.stringify({ content: 'edit' }),
        method: 'PATCH',
      }) as never,
      {
        params: Promise.resolve({
          conversationId: 'conversation-1',
          messageId: 'message-1',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(409);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });
});
