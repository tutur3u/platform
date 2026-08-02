import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assistantAiRow,
  assistantMessage,
  conversation,
  createAdminClientMock,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

describe('native AI chat message route', () => {
  beforeEach(resetMessageRouteMocks);

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

  it('resumes a personal AI request that persisted only the user message', async () => {
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
    const persistedUserMessage = {
      ...userMessage,
      metadata: {
        metadata: {
          requestId: '11111111-1111-4111-8111-111111111111',
        },
        source: 'ai-chat',
      },
    };
    let requestScopedReads = 0;
    mocks.listAiChatMessages.mockImplementation(
      async ({ requestId }: { requestId?: string }) => {
        if (!requestId) return [persistedUserMessage];
        requestScopedReads += 1;
        return requestScopedReads === 1
          ? [persistedUserMessage]
          : [persistedUserMessage, assistantMessage];
      }
    );

    const { POST } = await import('./route');
    const response = await POST(createRequest() as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createAiChatPost).toHaveBeenCalledTimes(1);
    const modelRequest = mocks.aiRouteBodies.at(-1) as {
      messages: { parts: { text?: string }[]; role: string }[];
    };
    expect(
      modelRequest.messages.filter(
        (message) =>
          message.role === 'user' && message.parts[0]?.text === 'hello'
      )
    ).toHaveLength(1);
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
});
