import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
  callPrivateChatRpc: vi.fn(),
  cancelExternalChatReply: vi.fn(),
  createAdminClient: vi.fn(),
  createAiChatPost: vi.fn(),
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  deliverExternalChatReplyIfBound: vi.fn(),
  finalizeExternalChatReply: vi.fn(),
  getAiChatId: vi.fn(),
  isAiChatConversationId: vi.fn(),
  isUserPersonalChatWorkspace: vi.fn(),
  isExternalChatConversation: vi.fn(),
  listAiChatMessages: vi.fn(),
  markExternalChatReplyDelivered: vi.fn(),
  aiRouteBodies: [] as unknown[],
  notifyChatMessageRecipients: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  reserveExternalChatReply: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serverError: vi.fn(),
  serverWarn: vi.fn(),
};

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
  getAiChatId: (...args: unknown[]) => mocks.getAiChatId(...args),
  isAiChatConversationId: (...args: unknown[]) =>
    mocks.isAiChatConversationId(...args),
  isUserPersonalChatWorkspace: (...args: unknown[]) =>
    mocks.isUserPersonalChatWorkspace(...args),
  listAiChatMessages: (...args: unknown[]) => mocks.listAiChatMessages(...args),
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
  chatRpcErrorResponse: (error: { code?: string }, fallback: string) =>
    Response.json(
      { message: fallback },
      { status: error.code === '22023' ? 400 : 500 }
    ),
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/notifications', () => ({
  notifyChatMessageRecipients: (
    ...args: Parameters<typeof mocks.notifyChatMessageRecipients>
  ) => mocks.notifyChatMessageRecipients(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({ conversationId: 'conversation-1' }),
  getChatRealtimeUserAudience: () => ({ userId: 'user-1' }),
  publishChatRealtimeEvent: (
    ...args: Parameters<typeof mocks.publishChatRealtimeEvent>
  ) => mocks.publishChatRealtimeEvent(...args),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  cancelExternalChatReply: (
    ...args: Parameters<typeof mocks.cancelExternalChatReply>
  ) => mocks.cancelExternalChatReply(...args),
  deliverExternalChatReplyIfBound: (
    ...args: Parameters<typeof mocks.deliverExternalChatReplyIfBound>
  ) => mocks.deliverExternalChatReplyIfBound(...args),
  finalizeExternalChatReply: (
    ...args: Parameters<typeof mocks.finalizeExternalChatReply>
  ) => mocks.finalizeExternalChatReply(...args),
  isExternalChatConversation: (...args: unknown[]) =>
    mocks.isExternalChatConversation(...args),
  markExternalChatReplyDelivered: (
    ...args: Parameters<typeof mocks.markExternalChatReplyDelivered>
  ) => mocks.markExternalChatReplyDelivered(...args),
  reserveExternalChatReply: (
    ...args: Parameters<typeof mocks.reserveExternalChatReply>
  ) => mocks.reserveExternalChatReply(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
    warn: (...args: Parameters<typeof mocks.serverWarn>) =>
      mocks.serverWarn(...args),
  },
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageFolderByPath: (...args: unknown[]) =>
    mocks.deleteWorkspaceStorageFolderByPath(...args),
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

const assistantAiRow: {
  completion_tokens: number;
  content: string;
  id: string;
  metadata: Record<string, unknown>;
  model: string;
  prompt_tokens: number;
} = {
  completion_tokens: 5,
  content: 'hi there',
  id: 'ai-message-1',
  metadata: { requestId: 'message-1' },
  model: 'gemini-3-flash',
  prompt_tokens: 7,
};

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/conversation-1/messages',
    {
      body: JSON.stringify({
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        content: 'hello',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

function createAdminClientMock(settingsError: unknown = null) {
  const settingsQuery = {
    eq: vi.fn(() => settingsQuery),
    maybeSingle: vi.fn(async () => ({ data: null, error: settingsError })),
    select: vi.fn(() => settingsQuery),
  };

  return {
    from: vi.fn(() => {
      const deleteQuery = {
        eq: vi.fn(async () => ({ error: null })),
      };
      return {
        delete: vi.fn(() => deleteQuery),
        upsert: vi.fn(async () => ({ error: null })),
      };
    }),
    schema: vi.fn(() => ({
      from: vi.fn(() => settingsQuery),
    })),
  };
}

function createSupabaseMock() {
  return {
    from: vi.fn(() => {
      const query = {
        eq: vi.fn(() => query),
        limit: vi.fn(async () => ({ data: [assistantAiRow], error: null })),
        order: vi.fn(() => query),
        select: vi.fn(() => query),
      };

      return query;
    }),
  };
}

function mockNativeAiRoute() {
  mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
    mocks.aiRouteBodies.push(await request.json());
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
    vi.clearAllMocks();
    mocks.isExternalChatConversation.mockResolvedValue(false);
    mocks.getAiChatId.mockReturnValue(null);
    mocks.isAiChatConversationId.mockReturnValue(false);
    mocks.isUserPersonalChatWorkspace.mockResolvedValue(true);
    mocks.listAiChatMessages.mockResolvedValue([]);
    mocks.cancelExternalChatReply.mockResolvedValue(undefined);
    mocks.reserveExternalChatReply.mockResolvedValue(null);
    mocks.deliverExternalChatReplyIfBound.mockResolvedValue(null);
    mocks.finalizeExternalChatReply.mockResolvedValue({
      message: userMessage,
      replayed: false,
    });
    mocks.markExternalChatReplyDelivered.mockResolvedValue(undefined);
    mocks.aiRouteBodies.length = 0;
    assistantAiRow.content = 'hi there';
    assistantAiRow.metadata = { requestId: 'message-1' };
    mocks.auth.supabase = createSupabaseMock();
    mocks.createAdminClient.mockResolvedValue(createAdminClientMock());
    mocks.notifyChatMessageRecipients.mockResolvedValue({
      createdCount: 0,
      failedCount: 0,
      recipientCount: 0,
    });
    mockNativeAiRoute();
    mockRouteContext();
  });

  it('finds persisted personal AI messages through wrapped metadata without deleting prior resources', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'ai-chat-1', model: 'gemini-3-flash', title: 'Existing' },
        error: null,
      })),
      select: vi.fn(() => query),
    };
    mocks.auth.supabase = { from: vi.fn(() => query) };
    mocks.listAiChatMessages.mockImplementation(async () => {
      const body = mocks.aiRouteBodies.at(-1) as
        | { persistenceRequestId?: string }
        | undefined;
      if (!body?.persistenceRequestId) return [];
      return [
        {
          ...assistantMessage,
          metadata: {
            metadata: { requestId: body.persistenceRequestId },
            source: 'ai-chat',
          },
        },
      ];
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.deleteWorkspaceStorageFolderByPath).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      message: expect.objectContaining({ id: 'message-2' }),
    });
  });

  it('replays a persisted personal AI response without invoking the model again', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'ai-chat-1', model: 'gemini-3-flash', title: 'Existing' },
        error: null,
      })),
      select: vi.fn(() => query),
    };
    mocks.auth.supabase = { from: vi.fn(() => query) };
    mocks.listAiChatMessages.mockResolvedValue([
      {
        ...assistantMessage,
        metadata: {
          metadata: {
            requestId: '11111111-1111-4111-8111-111111111111',
          },
          source: 'ai-chat',
        },
      },
    ]);

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: {
        content: assistantMessage.content,
        id: assistantMessage.id,
        kind: 'assistant',
      },
      messages: [
        expect.objectContaining({
          content: assistantMessage.content,
          id: assistantMessage.id,
          kind: 'assistant',
        }),
      ],
    });
    expect(mocks.listAiChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceStorageFolderByPath).not.toHaveBeenCalled();
  });

  it('persists native assistant replies with an atomic batch RPC', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        return { messages: [assistantMessage], replayed: false };
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
    expect(mocks.resolveChatRouteContext).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'create_chat',
        wsId: 'workspace-1',
      })
    );
    expect(mocks.aiRouteBodies).toContainEqual(
      expect.objectContaining({
        id: 'message-1',
        model: 'google/gemini-3.1-flash-lite',
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      message: assistantMessage,
      messages: [userMessage, assistantMessage],
    });
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_persist_ai_message_batch_idempotent',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_conversation_id: 'conversation-1',
        p_messages: [
          expect.objectContaining({
            content: 'hi there',
            metadata: expect.objectContaining({ source: 'native-ai-chat' }),
          }),
        ],
        p_request_id: 'message-1',
        p_ws_id: 'workspace-1',
      })
    );
    expect(mocks.notifyChatMessageRecipients).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      conversation,
      message: userMessage,
      wsId: 'workspace-1',
    });
  });

  it('reuses an already persisted native assistant reply on retry', async () => {
    const replayedAssistant = {
      ...assistantMessage,
      metadata: { requestId: 'message-1', source: 'native-ai-chat' },
    };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') {
        return [userMessage, replayedAssistant];
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
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_persist_ai_message_batch_idempotent',
      expect.anything()
    );
  });

  it('reuses the native user message request ID and republishes its saved reply', async () => {
    const replayedAssistant = {
      ...assistantMessage,
      metadata: { requestId: 'message-1', source: 'native-ai-chat' },
    };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: true };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') {
        return [userMessage, replayedAssistant];
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

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_send_user_message_idempotent',
      expect.objectContaining({
        p_request_id: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledTimes(2);
  });

  it('republishes an assistant batch replayed by the atomic RPC', async () => {
    const replayedAssistant = {
      ...assistantMessage,
      metadata: { requestId: 'message-1', source: 'native-ai-chat' },
    };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        return { messages: [replayedAssistant], replayed: true };
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
    await expect(response.json()).resolves.toMatchObject({
      message: replayedAssistant,
    });
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: userMessage })
    );
    expect(mocks.publishChatRealtimeEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ message: replayedAssistant })
    );
  });

  it('persists tool-only AI completions with their structured parts', async () => {
    assistantAiRow.content = '';
    assistantAiRow.metadata = {
      ai: { parts: [{ toolName: 'lookup', type: 'tool-result' }] },
      requestId: 'message-1',
    };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        return { messages: [assistantMessage], replayed: false };
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
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_persist_ai_message_batch_idempotent',
      expect.objectContaining({
        p_messages: [
          expect.objectContaining({
            content: 'Assistant completed the requested action.',
            metadata: expect.objectContaining({
              ai: expect.objectContaining({
                parts: [{ toolName: 'lookup', type: 'tool-result' }],
              }),
            }),
          }),
        ],
      })
    );
  });

  it('returns assistantError when assistant persistence fails after the user message saves', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
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

  it('does not run native AI with fallback settings after a database failure', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createAdminClientMock({ message: 'database unavailable' })
    );
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
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
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
  });

  it('does not persist when an externally bound reply fails delivery', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    });
    mocks.deliverExternalChatReplyIfBound.mockRejectedValue(
      new Error('bridge unavailable')
    );

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'external_delivery_failed',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.cancelExternalChatReply).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      wsId: 'workspace-1',
    });
  });

  it('preserves local reservation validation errors instead of returning 502', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockRejectedValue({ code: '22023' });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.cancelExternalChatReply).not.toHaveBeenCalled();
  });

  it('delivers first and atomically finalizes an externally bound reply', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    const reservation = {
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    };
    mocks.reserveExternalChatReply.mockResolvedValue(reservation);
    mocks.deliverExternalChatReplyIfBound.mockResolvedValue({
      deliveryId: reservation.deliveryId,
      idempotencyKey: reservation.idempotencyKey,
      thread: {},
    });
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_get_conversation') {
        return { ...conversation, type: 'channel' };
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
    expect(mocks.deliverExternalChatReplyIfBound).toHaveBeenCalledBefore(
      mocks.markExternalChatReplyDelivered
    );
    expect(mocks.markExternalChatReplyDelivered).toHaveBeenCalledBefore(
      mocks.finalizeExternalChatReply
    );
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.reserveExternalChatReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello' })
    );
    expect(mocks.deliverExternalChatReplyIfBound).toHaveBeenCalledWith(
      expect.objectContaining({ configurationRevision: 3 })
    );
  });

  it('replays realtime without repeating notifications for a finalized reply', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: true,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: 'message-1',
      threadId: 'thread-1',
    });
    mocks.finalizeExternalChatReply.mockResolvedValue({
      message: userMessage,
      replayed: true,
    });
    mocks.callPrivateChatRpc.mockResolvedValue({
      ...conversation,
      type: 'channel',
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ message: userMessage })
    );
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('fails closed when an external reservation unexpectedly returns null', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue(null);

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(502);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
  });

  it('rejects non-user kinds for external conversations', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    const request = new Request(createRequest().url, {
      body: JSON.stringify({ content: 'system note', kind: 'system' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'external_message_kind_unsupported',
    });
    expect(mocks.reserveExternalChatReply).not.toHaveBeenCalled();
  });

  it('preserves non-user message kinds for ordinary native conversations', async () => {
    const systemMessage = { ...userMessage, kind: 'system' };
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_message') return systemMessage;
      if (name === 'chat_get_conversation') return conversation;
      throw new Error(`Unexpected RPC ${name}`);
    });
    const request = new Request(createRequest().url, {
      body: JSON.stringify({ content: 'system note', kind: 'system' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_send_message',
      expect.objectContaining({ p_kind: 'system' })
    );
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('fails closed without reporting a remote rejection when binding lookup fails', async () => {
    mocks.isExternalChatConversation.mockRejectedValue(
      new Error('database unavailable')
    );

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to resolve chat delivery route',
    });
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
  });

  it('returns a persisted message when the post-save conversation lookup fails', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') {
        throw new Error('database unavailable');
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
      message: userMessage,
      messages: [userMessage],
    });
  });

  it('clamps message page limits before calling the database', async () => {
    mocks.callPrivateChatRpc.mockResolvedValue([]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/conversation-1/messages?limit=999.5'
      ) as never,
      {
        params: Promise.resolve({
          conversationId: 'conversation-1',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_messages',
      expect.objectContaining({ p_limit: 100 })
    );
  });

  it('rejects attachments before connected-site delivery', async () => {
    mocks.isExternalChatConversation.mockResolvedValue(true);
    mocks.reserveExternalChatReply.mockResolvedValue({
      configurationRevision: 3,
      delivered: false,
      deliveryId: 'delivery-1',
      idempotencyKey: 'idempotency-1',
      messageId: null,
      threadId: 'thread-1',
    });
    const request = new Request(createRequest().url, {
      body: JSON.stringify({
        attachments: [{ filename: 'scan.pdf', path: 'chat/scan.pdf' }],
        content: '',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.deliverExternalChatReplyIfBound).not.toHaveBeenCalled();
    expect(mocks.finalizeExternalChatReply).not.toHaveBeenCalled();
  });
});
