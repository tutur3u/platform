// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { ChatConversation, ChatMessage } from '@/lib/chat/private-rpc';
import {
  assistantMessage,
  conversation,
  createAdminClientMock,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

beforeEach(resetMessageRouteMocks);

it('starts the authorized history read while settings are still pending', async () => {
  let releaseSettings!: () => void;
  const settings = new Promise<void>((resolve) => {
    releaseSettings = resolve;
  });
  const admin = createAdminClientMock();
  const query = admin.schema().from();
  query.maybeSingle.mockImplementation(async () => {
    await settings;
    return { data: null, error: null };
  });
  mocks.createAdminClient.mockResolvedValue(admin);
  mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
    if (name === 'chat_send_user_message_idempotent')
      return { message: userMessage, replayed: false };
    if (name === 'chat_get_conversation') return conversation;
    if (name === 'chat_list_messages') return [userMessage];
    if (name === 'chat_persist_ai_message_batch_idempotent')
      return { messages: [userMessage], replayed: false };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const { POST } = await import('./route');
  const response = POST(createRequest() as never, {
    params: Promise.resolve({
      conversationId: conversation.id,
      wsId: conversation.wsId,
    }),
  });
  // Drain the finite route microtasks without resolving the settings boundary.
  for (let index = 0; index < 30; index++) await Promise.resolve();
  try {
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_messages',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_ws_id: 'workspace-1',
        p_conversation_id: conversation.id,
      })
    );
  } finally {
    releaseSettings();
    await response;
  }
});

it('streams first text while initial realtime publication is still pending', async () => {
  const nativeUser: ChatMessage = { ...userMessage, kind: 'user' };
  const nativeConversation: ChatConversation = {
    ...conversation,
    type: 'ai',
    latestMessage: nativeUser,
  };
  let release!: () => void;
  const publication = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
    if (name === 'chat_list_messages') return [userMessage];
    if (name === 'chat_persist_ai_message_batch_idempotent')
      return { messages: [assistantMessage], replayed: false };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const { streamNativeAiConversationResponse } = await import(
    './native-ai-message'
  );
  const response = streamNativeAiConversationResponse({
    auth: mocks.auth as never,
    context: { normalizedWsId: 'workspace-1' } as never,
    conversation: nativeConversation,
    userMessage: nativeUser,
    request: createRequest() as never,
    miraMode: false,
    publishInitialMessages: async () => {
      started = true;
      await publication;
    },
  });
  const reader = response.body!.getReader();
  let firstText = false;
  const reading = (async () => {
    const decoder = new TextDecoder();
    for (;;) {
      const part = await reader.read();
      if (part.done) return;
      if (decoder.decode(part.value).includes('assistant_delta'))
        firstText = true;
    }
  })();
  try {
    await vi.waitFor(
      () => {
        expect(started).toBe(true);
        expect(firstText).toBe(true);
      },
      { interval: 1, timeout: 1000 }
    );
  } finally {
    release();
    await reading;
  }
});
