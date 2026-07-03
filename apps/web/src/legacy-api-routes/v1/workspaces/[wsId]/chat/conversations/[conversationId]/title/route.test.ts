import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: { from: vi.fn() },
    user: { id: 'user-1' },
  },
  capMaxOutputTokensByCredits: vi.fn(),
  callPrivateChatRpc: vi.fn(),
  checkAiCredits: vi.fn(),
  createAdminClient: vi.fn(),
  deductAiCredits: vi.fn(),
  generateText: vi.fn(),
  google: vi.fn((model: string) => ({ model })),
  isAiChatConversationId: vi.fn(),
  listAiChatMessages: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveAiMemoryWorkspaceIdForUser: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serverError: vi.fn(),
  serverWarn: vi.fn(),
  sbAdmin: { from: vi.fn() },
  updateAiChatConversationTitle: vi.fn(),
  withAiMemory: vi.fn(async ({ model }) => model),
};

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: (
    ...args: Parameters<typeof mocks.capMaxOutputTokensByCredits>
  ) => mocks.capMaxOutputTokensByCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  resolveAiMemoryWorkspaceIdForUser: (
    ...args: Parameters<typeof mocks.resolveAiMemoryWorkspaceIdForUser>
  ) => mocks.resolveAiMemoryWorkspaceIdForUser(...args),
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('ai', () => ({
  generateText: (...args: Parameters<typeof mocks.generateText>) =>
    mocks.generateText(...args),
}));

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

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json(
      { message: 'Failed to generate chat title' },
      { status: 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  isAiChatConversationId: (
    ...args: Parameters<typeof mocks.isAiChatConversationId>
  ) => mocks.isAiChatConversationId(...args),
  listAiChatMessages: (...args: Parameters<typeof mocks.listAiChatMessages>) =>
    mocks.listAiChatMessages(...args),
  updateAiChatConversationTitle: (
    ...args: Parameters<typeof mocks.updateAiChatConversationTitle>
  ) => mocks.updateAiChatConversationTitle(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  publishChatRealtimeEvent: (
    ...args: Parameters<typeof mocks.publishChatRealtimeEvent>
  ) => mocks.publishChatRealtimeEvent(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
    warn: (...args: Parameters<typeof mocks.serverWarn>) =>
      mocks.serverWarn(...args),
  },
}));

const conversation = {
  aiEnabled: false,
  archivedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: 'conversation-1',
  latestMessage: null,
  memberCount: 1,
  members: [],
  metadata: {},
  title: 'Old title',
  type: 'group',
  unreadCount: 0,
  updatedAt: '2026-06-02T00:00:00.000Z',
  wsId: 'workspace-1',
};

const messages = Array.from({ length: 6 }, (_, index) => ({
  attachments: [],
  content: `message ${index + 1}`,
  conversationId: 'conversation-1',
  createdAt: `2026-06-02T00:0${index}:00.000Z`,
  deletedAt: null,
  editedAt: null,
  id: `message-${index + 1}`,
  kind: index % 2 === 0 ? 'user' : 'assistant',
  metadata: {},
  reactions: [],
  replyToMessageId: null,
  sender: null,
  senderId: index % 2 === 0 ? 'user-1' : null,
  updatedAt: null,
}));

function mockRouteContext() {
  mocks.resolveChatRouteContext.mockResolvedValue({
    context: { normalizedWsId: 'workspace-1' },
    ok: true,
  });
}

async function callRoute(conversationId = 'conversation-1') {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/title', { method: 'POST' }) as never,
    {
      params: Promise.resolve({
        conversationId,
        wsId: 'workspace-1',
      }),
    }
  );
}

describe('chat conversation generated title route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteContext();
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 32,
      remainingCredits: 20,
      tier: 'PRO',
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(24);
    mocks.createAdminClient.mockResolvedValue(mocks.sbAdmin);
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 19,
      success: true,
    });
    mocks.resolveAiMemoryWorkspaceIdForUser.mockResolvedValue('workspace-1');
    mocks.generateText.mockResolvedValue({
      text: 'Recent Planning Decisions',
      usage: {
        inputTokens: 80,
        outputTokenDetails: { reasoningTokens: 3 },
        outputTokens: 12,
      },
    });
    mocks.isAiChatConversationId.mockImplementation((conversationId: string) =>
      conversationId.startsWith('ai-chat-')
    );
    mocks.listAiChatMessages.mockResolvedValue(messages);
    mocks.updateAiChatConversationTitle.mockResolvedValue({
      ...conversation,
      id: 'ai-chat-chat-1',
      metadata: { aiChatId: 'chat-1', source: 'ai-chat' },
      title: 'Recent Planning Decisions',
      type: 'ai',
    });
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return messages.slice(1);
      if (name === 'chat_update_conversation') {
        return { ...conversation, title: 'Recent Planning Decisions' };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it('generates and saves a title from the five most recent messages', async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: { title: 'Recent Planning Decisions' },
      title: 'Recent Planning Decisions',
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_messages',
      {
        p_actor_user_id: 'user-1',
        p_before: null,
        p_conversation_id: 'conversation-1',
        p_limit: 5,
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 24,
        prompt: expect.stringContaining('message 2'),
        system: expect.stringContaining('conversation title'),
      })
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('message 1'),
      })
    );
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_update_conversation',
      {
        p_actor_user_id: 'user-1',
        p_conversation_id: 'conversation-1',
        p_input: { title: 'Recent Planning Decisions' },
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      'workspace-1',
      'google/gemini-3.1-flash-lite',
      'chat',
      { userId: 'user-1' }
    );
    expect(mocks.capMaxOutputTokensByCredits).toHaveBeenCalledWith(
      mocks.sbAdmin,
      'google/gemini-3.1-flash-lite',
      32,
      20
    );
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'chat',
        inputTokens: 80,
        metadata: {
          conversationId: 'conversation-1',
          source: 'native_chat_title',
        },
        modelId: 'google/gemini-3.1-flash-lite',
        outputTokens: 12,
        reasoningTokens: 3,
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    );
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({
          title: 'Recent Planning Decisions',
        }),
        type: 'conversation.updated',
      })
    );
  });

  it('rejects conversations without messages', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [];
      throw new Error(`Unexpected RPC ${name}`);
    });

    const response = await callRoute();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'No messages found',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
  });

  it('rejects title generation when AI credits are unavailable', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'NO_BALANCE',
      errorMessage: 'AI credits unavailable',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'FREE',
    });

    const response = await callRoute();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'NO_BALANCE',
      message: 'AI credits unavailable',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_update_conversation',
      expect.anything()
    );
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('generates and saves a title for synthetic AI chat conversations', async () => {
    const response = await callRoute('ai-chat-chat-1');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: {
        id: 'ai-chat-chat-1',
        metadata: { aiChatId: 'chat-1', source: 'ai-chat' },
        title: 'Recent Planning Decisions',
      },
      title: 'Recent Planning Decisions',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.listAiChatMessages).toHaveBeenCalledWith({
      conversationId: 'ai-chat-chat-1',
      limit: 5,
      supabase: mocks.auth.supabase,
      user: mocks.auth.user,
      wsId: 'workspace-1',
    });
    expect(mocks.updateAiChatConversationTitle).toHaveBeenCalledWith({
      conversationId: 'ai-chat-chat-1',
      supabase: mocks.auth.supabase,
      title: 'Recent Planning Decisions',
      user: mocks.auth.user,
      wsId: 'workspace-1',
    });
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({
          id: 'ai-chat-chat-1',
          title: 'Recent Planning Decisions',
        }),
        conversationId: 'ai-chat-chat-1',
        type: 'conversation.updated',
      })
    );
  });
});
