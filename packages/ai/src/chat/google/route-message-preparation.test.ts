import { describe, expect, it, vi } from 'vitest';
import {
  persistLatestUserMessage,
  rewriteAttachmentPathsInMessages,
} from './route-message-preparation';

describe('rewriteAttachmentPathsInMessages', () => {
  it('rewrites attachment storage paths using moved temp-file mappings', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user' as const,
        metadata: {
          attachments: [
            {
              name: 'image.png',
              size: 123,
              storagePath:
                'ws/chats/ai/resources/temp/user/1772564518861_image.png',
              type: 'image/png',
            },
          ],
        },
        parts: [{ type: 'text' as const, text: 'Please analyze this image' }],
      },
    ];

    const rewritten = rewriteAttachmentPathsInMessages(
      messages,
      new Map([
        [
          'ws/chats/ai/resources/temp/user/1772564518861_image.png',
          'ws/chats/ai/resources/chat-1/1772564518861_image.png',
        ],
      ])
    );

    expect(
      (
        rewritten[0]?.metadata as {
          attachments?: Array<{ storagePath: string }>;
        }
      ).attachments?.[0]?.storagePath
    ).toBe('ws/chats/ai/resources/chat-1/1772564518861_image.png');
  });
});

describe('persistLatestUserMessage', () => {
  it('persists attachment-only turns without synthetic placeholder text', async () => {
    const insertChatMessage = vi.fn(async () => ({ error: null }));

    const result = await persistLatestUserMessage({
      chatId: 'chat-1',
      insertChatMessage,
      model: 'google/gemini-2.5-flash',
      normalizedMessages: [
        {
          id: 'user-1',
          role: 'user',
          metadata: {
            attachments: [
              {
                name: 'note.wav',
                size: 5,
                storagePath: 'ws/chat/note.wav',
                type: 'audio/wav',
              },
            ],
          },
          parts: [
            { type: 'text', text: 'Please analyze the attached file(s).' },
          ],
        },
      ],
      source: 'Mira',
      userId: 'user-1',
    });

    expect(result).toBeNull();
    expect(insertChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 'chat-1',
        content: '',
      })
    );
  });
});
