import type { ModelMessage, UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
  attachYoutubeVideoInputToLatestUserMessage,
  extractLatestUserMessageContent,
  normalizeYoutubeVideoUrlForGemini,
  originalUserText,
  persistLatestUserMessage,
  persistRequestScopedUserMessage,
} from './route-message-preparation';

describe('route message preparation YouTube video inputs', () => {
  it('normalizes YouTube URLs to a single video without playlist parameters', () => {
    expect(
      normalizeYoutubeVideoUrlForGemini(
        'https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ'
      )
    ).toBe('https://youtu.be/dQw4w9WgXcQ');

    expect(
      normalizeYoutubeVideoUrlForGemini(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'
      )
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('attaches one YouTube URL as a Google-compatible video file part', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Summarize https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ',
      },
    ];

    const result = attachYoutubeVideoInputToLatestUserMessage(messages, true);
    const latest = result[0]!;

    expect(Array.isArray(latest.content)).toBe(true);
    expect(latest.content).toEqual([
      {
        type: 'text',
        text: 'Summarize https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ',
      },
      {
        type: 'file',
        data: 'https://youtu.be/dQw4w9WgXcQ',
        mediaType: 'video/mp4',
      },
    ]);
  });

  it('does not attach YouTube file inputs when disabled', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Summarize https://youtu.be/dQw4w9WgXcQ',
      },
    ];

    expect(attachYoutubeVideoInputToLatestUserMessage(messages, false)).toBe(
      messages
    );
  });

  it('does not persist the synthetic YouTube video file marker', async () => {
    const insertChatMessage = vi.fn().mockResolvedValue({ error: null });
    await persistLatestUserMessage({
      processedMessages: [
        { role: 'system', content: 'System prompt' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize https://youtu.be/dQw4w9WgXcQ',
            },
            {
              type: 'file',
              data: 'https://youtu.be/dQw4w9WgXcQ',
              mediaType: 'video/mp4',
            },
          ],
        },
      ],
      chatId: 'chat_1',
      insertChatMessage,
      source: 'Mira',
    });

    expect(insertChatMessage).toHaveBeenCalledWith({
      chat_id: 'chat_1',
      message: 'Summarize https://youtu.be/dQw4w9WgXcQ',
      source: 'Mira',
    });
  });
});

describe('request-scoped user-message persistence', () => {
  const params = {
    chatId: 'chat_1',
    content: 'Saved prompt',
    creatorId: 'user_1',
    requestId: '11111111-1111-4111-8111-111111111111',
    source: 'Rewise' as const,
  };

  it('accepts an exact persisted message after a unique-key race', async () => {
    const result = await persistRequestScopedUserMessage({
      ...params,
      findExistingMessage: vi.fn().mockResolvedValue({
        data: { content: params.content, creator_id: params.creatorId },
        error: null,
      }),
      insertMessage: vi.fn().mockResolvedValue({
        error: { code: '23505', message: 'duplicate key' },
      }),
    });

    expect(result).toEqual({ error: null });
  });

  it('rejects a request marker attached to different content', async () => {
    const result = await persistRequestScopedUserMessage({
      ...params,
      findExistingMessage: vi.fn().mockResolvedValue({
        data: { content: 'Different prompt', creator_id: params.creatorId },
        error: null,
      }),
      insertMessage: vi.fn().mockResolvedValue({
        error: { code: '23505', message: 'duplicate key' },
      }),
    });

    expect(result.error?.code).toBe('23505');
  });
});

describe('durable original-user receipt text', () => {
  it('binds original UI text while file preparation changes stored content', async () => {
    const messages: UIMessage[] = [
      {
        id: 'user',
        role: 'user',
        parts: [
          { type: 'text', text: 'Read attachment' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            url: 'https://example.test/file.pdf',
          },
        ],
      },
    ];
    const originalText = originalUserText(messages);
    const content = extractLatestUserMessageContent([
      {
        role: 'user',
        content: [
          { type: 'text', text: originalText },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: new Uint8Array([1]),
          },
        ],
      },
    ]);
    expect(content).toBe('Read attachment\n[File: attached]');
    const insertMessage = vi.fn().mockResolvedValue({ error: null });
    await expect(
      persistRequestScopedUserMessage({
        chatId: 'chat',
        creatorId: 'actor',
        content,
        originalText,
        requestId: '11111111-1111-4111-8111-111111111111',
        source: 'Mira',
        insertMessage,
        findExistingMessage: vi.fn(),
      })
    ).resolves.toEqual({ error: null });
    expect(insertMessage).toHaveBeenCalledExactlyOnceWith({
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Mira',
      requestText: 'Read attachment',
    });
  });
  it('rejects a unique-key receipt with conflicting original text', async () => {
    const result = await persistRequestScopedUserMessage({
      chatId: 'chat',
      content: 'Prepared prompt',
      originalText: 'Original',
      creatorId: 'actor',
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Mira',
      insertMessage: vi
        .fn()
        .mockResolvedValue({ error: { code: '23505', message: 'duplicate' } }),
      findExistingMessage: vi.fn().mockResolvedValue({
        data: {
          content: 'Prepared prompt',
          creator_id: 'actor',
          metadata: { requestText: 'Other' },
        },
        error: null,
      }),
    });
    expect(result.error?.code).toBe('23505');
  });
  it('retains exact-content idempotency for historical rows without requestText', async () => {
    const row = { content: 'Original', creator_id: 'actor' };
    const findExistingMessage = vi
      .fn()
      .mockResolvedValue({ data: row, error: null });
    const result = await persistRequestScopedUserMessage({
      chatId: 'chat',
      content: 'Original',
      originalText: 'Original',
      creatorId: 'actor',
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Mira',
      insertMessage: vi
        .fn()
        .mockResolvedValue({ error: { code: '23505', message: 'duplicate' } }),
      findExistingMessage,
    });
    expect(result.error).toBeNull();
  });
});
