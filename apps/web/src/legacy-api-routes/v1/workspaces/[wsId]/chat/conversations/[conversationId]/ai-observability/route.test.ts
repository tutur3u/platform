import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: { from: vi.fn() },
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  canAccessAiChatConversation: vi.fn(),
  createAdminClient: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serverError: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/agent-discovery', () => {
  const prefixes = ['ai-chat-', 'legacy-ai-'];

  return {
    canAccessAiChatConversation: (
      ...args: Parameters<typeof mocks.canAccessAiChatConversation>
    ) => mocks.canAccessAiChatConversation(...args),
    getAiChatId: (conversationId: string) => {
      const prefix = prefixes.find((item) => conversationId.startsWith(item));
      return prefix ? conversationId.slice(prefix.length) : null;
    },
    isAiChatConversationId: (conversationId: string) =>
      prefixes.some((prefix) => conversationId.startsWith(prefix)),
  };
});

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to load AI chat observability' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

const aiMessage = {
  chat_id: 'chat-1',
  completion_tokens: 5,
  content: 'private user prompt and assistant response',
  created_at: '2026-06-01T00:00:00.000Z',
  id: 'message-1',
  metadata: {},
  model: 'gemini-3-flash',
  prompt_tokens: 7,
  role: 'user',
};

function createAdminClientMock() {
  const messagesQuery = {
    eq: vi.fn(() => messagesQuery),
    order: vi.fn(async () => ({ data: [aiMessage], error: null })),
    select: vi.fn(() => messagesQuery),
  };
  const transactionsQuery = {
    in: vi.fn(async () => ({ data: [], error: null })),
    select: vi.fn(() => transactionsQuery),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'ai_chat_messages') return messagesQuery;
      if (table === 'ai_credit_transactions') return transactionsQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function mockRouteContext() {
  mocks.resolveChatRouteContext.mockResolvedValue({
    context: { normalizedWsId: 'workspace-1' },
    ok: true,
  });
}

async function callRoute(conversationId: string) {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/${conversationId}`) as never, {
    params: Promise.resolve({
      conversationId,
      wsId: 'workspace-1',
    }),
  });
}

describe('AI chat observability route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteContext();
    mocks.createAdminClient.mockResolvedValue(createAdminClientMock());
  });

  it('rejects prefixed AI chat IDs the caller does not own', async () => {
    mocks.canAccessAiChatConversation.mockResolvedValue(false);

    const response = await callRoute('ai-chat-victim-chat-id');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Conversation is not an AI chat',
    });
    expect(mocks.canAccessAiChatConversation).toHaveBeenCalledWith({
      conversationId: 'ai-chat-victim-chat-id',
      supabase: mocks.auth.supabase,
      userId: 'user-1',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('loads observability for owned legacy AI chats', async () => {
    mocks.canAccessAiChatConversation.mockResolvedValue(true);

    const response = await callRoute('legacy-ai-chat-1');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      observability: {
        messages: [
          {
            contentPreview: 'private user prompt and assistant response',
            id: 'message-1',
            model: 'gemini-3-flash',
          },
        ],
        totals: {
          messageCount: 1,
          totalTokens: 12,
        },
      },
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('keeps native conversation IDs behind the private membership RPC', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue({
      id: 'native-conversation-1',
      type: 'ai',
    });

    const response = await callRoute('native-conversation-1');

    expect(response.status).toBe(200);
    expect(mocks.canAccessAiChatConversation).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_get_conversation',
      {
        p_actor_user_id: 'user-1',
        p_conversation_id: 'native-conversation-1',
        p_ws_id: 'workspace-1',
      }
    );
  });
});
