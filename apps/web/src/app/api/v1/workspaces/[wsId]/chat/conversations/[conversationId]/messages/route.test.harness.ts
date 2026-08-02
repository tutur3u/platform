import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

export const mocks = {
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

export const userMessage = {
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

export const assistantMessage = {
  ...userMessage,
  content: 'hi there',
  id: 'message-2',
  kind: 'assistant',
  senderId: null,
};

export const conversation = {
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

export const assistantAiRow: {
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

export function createRequest() {
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

export function createAdminClientMock(settingsError: unknown = null) {
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
        limit: vi.fn(async () => ({
          data: mocks.aiRouteBodies.length > 0 ? [assistantAiRow] : [],
          error: null,
        })),
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

export function resetMessageRouteMocks() {
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
}
