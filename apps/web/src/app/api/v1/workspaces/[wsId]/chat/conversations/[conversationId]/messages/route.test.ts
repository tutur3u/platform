import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  createAdminClient: vi.fn(),
  createAiChatPost: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serverError: vi.fn(),
  serverWarn: vi.fn(),
}));

vi.mock('@tuturuuu/ai/chat/google/route', () => ({
  createPOST: (...args: Parameters<typeof mocks.createAiChatPost>) =>
    mocks.createAiChatPost(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/agent-discovery', () => ({
  getAiChatId: () => null,
  isAiChatConversationId: () => false,
  listAiChatMessages: vi.fn(),
}));

vi.mock('@/lib/chat/ai-settings', () => ({
  isChatAiSettingsSchemaCacheError: () => false,
  mapNativeChatAiSettingsRow: () => ({
    credit_source: 'workspace',
    credit_ws_id: null,
    model_id: 'gemini-3-flash',
    system_prompt: null,
    thinking_mode: 'fast',
  }),
  NATIVE_CHAT_AI_SETTINGS_FULL_SELECT: 'full',
  NATIVE_CHAT_AI_SETTINGS_LEGACY_SELECT: 'legacy',
  serializeChatAiSettingsDbError: (error: unknown) => error,
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json({ message: 'Failed to send chat message' }, { status: 500 }),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  getChatRealtimeUserAudience: () => ({ userId: 'user-1' }),
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

vi.mock('@/lib/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

const userMessage = {
  attachments: [],
  content: 'hello',
  conversationId: 'conversation-1',
  createdAt: '2026-05-30T07:00:00.000Z',
  deletedAt: null,
  editedAt: null,
  id: 'message-1',
  kind: 'user',
  metadata: {},
  reactions: [],
  replyToMessageId: null,
  sender: null,
  senderId: 'user-1',
  updatedAt: null,
};

const assistantMessage = {
  ...userMessage,
  content: 'hi there',
  id: 'message-2',
  kind: 'assistant',
  senderId: null,
};

const conversation = {
  aiEnabled: true,
  archivedAt: null,
  createdAt: '2026-05-30T07:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: 'conversation-1',
  latestMessage: userMessage,
  memberCount: 1,
  members: [],
  metadata: {},
  title: 'Native AI',
  type: 'ai',
  unreadCount: 0,
  updatedAt: '2026-05-30T07:00:00.000Z',
  wsId: 'workspace-1',
};

const assistantAiRow = {
  completion_tokens: 5,
  content: 'hi there',
  id: 'ai-message-1',
  metadata: {},
  model: 'gemini-3-flash',
  prompt_tokens: 7,
};

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/conversation-1/messages',
    {
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

function createAdminClientMock() {
  const settingsQuery = {
    eq: vi.fn(() => settingsQuery),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    select: vi.fn(() => settingsQuery),
  };

  return {
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
    })),
    schema: vi.fn(() => ({
      from: vi.fn(() => settingsQuery),
    })),
  };
}

function createSupabaseMock() {
  let queryIndex = 0;

  return {
    from: vi.fn(() => {
      const currentQueryIndex = queryIndex++;
      const query = {
        eq: vi.fn(() =>
          currentQueryIndex === 0
            ? Promise.resolve({ data: [], error: null })
            : query
        ),
        limit: vi.fn(async () => ({ data: [assistantAiRow], error: null })),
        order: vi.fn(() => query),
        select: vi.fn(() => query),
      };

      return query;
    }),
  };
}

function mockNativeAiRoute() {
  mocks.createAiChatPost.mockReturnValue(async () => {
    return new Response(
      'data: {"type":"text-delta","delta":"hi there"}\n\ndata: [DONE]\n\n',
      {
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
      }
    );
  });
}

function mockRouteContext() {
  mocks.resolveChatRouteContext.mockResolvedValue({
    context: { normalizedWsId: 'workspace-1' },
    ok: true,
  });
}

describe('native AI chat message route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.auth.supabase = createSupabaseMock();
    mocks.createAdminClient.mockResolvedValue(createAdminClientMock());
    mockNativeAiRoute();
    mockRouteContext();
  });

  it('persists native assistant replies with chat_persist_ai_message', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_message') return userMessage;
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message') return assistantMessage;
      throw new Error(`Unexpected RPC ${name}`);
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      message: assistantMessage,
      messages: [userMessage, assistantMessage],
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_persist_ai_message',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_content: 'hi there',
        p_conversation_id: 'conversation-1',
        p_metadata: expect.objectContaining({
          source: 'native-ai-chat',
        }),
        p_ws_id: 'workspace-1',
      })
    );
  });

  it('returns assistantError when assistant persistence fails after the user message saves', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_message') return userMessage;
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message') {
        throw new Error('chat_manage_permission_required');
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      assistantError: 'Assistant response failed. Your message was saved.',
      message: userMessage,
      messages: [userMessage],
    });
  });
});
