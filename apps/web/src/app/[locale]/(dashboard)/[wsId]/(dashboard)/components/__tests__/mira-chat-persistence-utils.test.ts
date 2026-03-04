import { describe, expect, it } from 'vitest';
import { findMatchingMessageIdForStoredFile } from '../mira-chat-persistence-utils';

describe('findMatchingMessageIdForStoredFile', () => {
  it('matches stored files by storage path instead of filename', () => {
    const result = findMatchingMessageIdForStoredFile({
      files: [
        {
          path: 'ws/chats/ai/resources/chat-1/second/mira-audio.webm',
        },
      ],
      messages: [
        {
          id: 'message-1',
          metadata: {
            attachments: [
              {
                name: 'mira-audio.webm',
                size: 1,
                storagePath:
                  'ws/chats/ai/resources/chat-1/first/mira-audio.webm',
                type: 'audio/webm',
              },
            ],
          },
          role: 'user',
        },
        {
          id: 'message-2',
          metadata: {
            attachments: [
              {
                name: 'mira-audio.webm',
                size: 1,
                storagePath:
                  'ws/chats/ai/resources/chat-1/second/mira-audio.webm',
                type: 'audio/webm',
              },
            ],
          },
          role: 'user',
        },
      ],
    });

    expect(
      result.get('ws/chats/ai/resources/chat-1/second/mira-audio.webm')
    ).toBe('message-2');
  });

  it('uses the single user message as a legacy fallback only when no metadata attachments exist', () => {
    const result = findMatchingMessageIdForStoredFile({
      files: [
        {
          path: 'ws/chats/ai/resources/chat-1/mira-audio.webm',
        },
      ],
      messages: [
        {
          id: 'message-1',
          metadata: null,
          role: 'user',
        },
      ],
    });

    expect(result.get('ws/chats/ai/resources/chat-1/mira-audio.webm')).toBe(
      'message-1'
    );
  });
});
