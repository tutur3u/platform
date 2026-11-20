import { QueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  type ChatMessagesPage,
  flattenChatMessagePages,
  mergeCachedMessages,
  patchCachedMessages,
} from './hooks-messages';
import { chatQueryKeys } from './query-keys';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
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
    ...overrides,
  };
}

describe('mergeCachedMessages', () => {
  it('keeps a pending user message above the incoming assistant response', () => {
    const optimisticUserMessage = createMessage({
      createdAt: '2026-05-30T07:00:02.000Z',
      id: 'optimistic-user',
      metadata: { optimistic: true },
    });
    const assistantMessage = createMessage({
      content: 'hi there',
      createdAt: '2026-05-30T07:00:01.000Z',
      id: 'message-assistant',
      kind: 'assistant',
      senderId: null,
    });

    expect(
      mergeCachedMessages([optimisticUserMessage], [assistantMessage]).map(
        ({ id }) => id
      )
    ).toEqual(['optimistic-user', 'message-assistant']);
  });

  it('uses persisted timestamps once the saved user message arrives', () => {
    const userMessage = createMessage({
      createdAt: '2026-05-30T07:00:00.000Z',
      id: 'message-user',
    });
    const assistantMessage = createMessage({
      content: 'hi there',
      createdAt: '2026-05-30T07:00:01.000Z',
      id: 'message-assistant',
      kind: 'assistant',
      senderId: null,
    });

    expect(
      mergeCachedMessages(
        [assistantMessage],
        [userMessage, assistantMessage]
      ).map(({ id }) => id)
    ).toEqual(['message-user', 'message-assistant']);
  });
});

describe('patchCachedMessages', () => {
  it('patches infinite message pages used by the chat workspace', () => {
    const queryClient = new QueryClient();
    const wsId = 'workspace-1';
    const conversationId = 'conversation-1';
    const message = createMessage();
    const queryKey = chatQueryKeys.messagesInfinite(wsId, conversationId, 80);

    queryClient.setQueryData<{
      pageParams: (string | null)[];
      pages: ChatMessagesPage[];
    }>(queryKey, {
      pageParams: [null],
      pages: [
        {
          hasMore: false,
          limit: 80,
          messages: [],
          nextBefore: null,
        },
      ],
    });

    patchCachedMessages(queryClient, wsId, conversationId, (current) =>
      mergeCachedMessages(current, [message])
    );

    expect(
      queryClient
        .getQueryData<{
          pageParams: (string | null)[];
          pages: ChatMessagesPage[];
        }>(queryKey)
        ?.pages[0]?.messages.map(({ id }) => id)
    ).toEqual(['message-1']);
  });

  it('keeps loaded history and its exhausted cursor after realtime updates', () => {
    const queryClient = new QueryClient();
    const wsId = 'workspace-1';
    const conversationId = 'conversation-1';
    const original = createMessage({ id: 'original' });
    const reply = createMessage({
      createdAt: '2026-05-30T07:01:00.000Z',
      id: 'reply',
      replyToMessageId: original.id,
    });
    const data = {
      pageParams: [null, reply.createdAt],
      pages: [
        {
          hasMore: true,
          limit: 1,
          messages: [reply],
          nextBefore: reply.createdAt,
        },
        {
          hasMore: false,
          limit: 1,
          messages: [original],
          nextBefore: original.createdAt,
        },
      ],
    };
    const queryKey = chatQueryKeys.messagesInfinite(wsId, conversationId, 1);
    queryClient.setQueryData(queryKey, data);
    const deletedOriginal = {
      ...original,
      content: '',
      deletedAt: '2026-05-30T07:02:00.000Z',
    };

    patchCachedMessages(queryClient, wsId, conversationId, (current) =>
      mergeCachedMessages(current, [deletedOriginal])
    );

    const updated = queryClient.getQueryData<typeof data>(queryKey);
    expect(updated?.pageParams).toEqual(data.pageParams);
    expect(updated?.pages[1]).toEqual({
      ...data.pages[1],
      messages: [deletedOriginal],
    });
    expect(flattenChatMessagePages(updated)).toEqual([deletedOriginal, reply]);
  });
});
