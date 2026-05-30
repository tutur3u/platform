import type { ChatMessage } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { mergeCachedMessages } from './hooks-messages';

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
