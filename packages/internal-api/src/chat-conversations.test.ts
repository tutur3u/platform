import { describe, expect, it, vi } from 'vitest';
import { sendWorkspaceChatMessageStream } from './chat-conversations';
import type { ChatMessage } from './chat-types';

const userMessage: ChatMessage = {
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

function ndjsonResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => JSON.stringify(event)).join('\n'))
      );
      controller.close();
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    status: 201,
  });
}

describe('sendWorkspaceChatMessageStream', () => {
  it('returns partial success when the assistant fails after the user message is saved', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ndjsonResponse([
        { message: userMessage, type: 'message' },
        {
          message: 'Assistant response failed. Your message was saved.',
          type: 'error',
        },
        { type: 'done' },
      ])
    );

    const result = await sendWorkspaceChatMessageStream(
      'workspace-1',
      'conversation-1',
      { content: 'hello' },
      {},
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result).toEqual({
      assistantError: 'Assistant response failed. Your message was saved.',
      message: userMessage,
      messages: [userMessage],
    });
  });

  it('throws stream errors when no message was saved', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        ndjsonResponse([{ message: 'Failed to send message', type: 'error' }])
      );

    await expect(
      sendWorkspaceChatMessageStream(
        'workspace-1',
        'conversation-1',
        { content: 'hello' },
        {},
        {
          baseUrl: 'https://internal.example.com',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).rejects.toThrow('Failed to send message');
  });
});
