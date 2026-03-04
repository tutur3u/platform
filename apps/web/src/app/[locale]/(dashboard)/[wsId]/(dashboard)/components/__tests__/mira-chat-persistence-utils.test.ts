import { describe, expect, it } from 'vitest';
import {
  findMatchingMessageIdForStoredFile,
  mergeMessageAttachmentMaps,
} from '../mira-chat-persistence-utils';

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

  it('preserves richer live attachment urls when restored chat state is weaker', () => {
    const merged = mergeMessageAttachmentMaps(
      new Map([
        [
          'message-1',
          [
            {
              alias: null,
              id: 'live-attachment',
              name: 'clip.mov',
              previewUrl: 'blob:video-preview',
              signedUrl: 'https://example.com/live.mov',
              size: 10,
              storagePath: 'ws/chats/ai/resources/temp/user/clip.mov',
              type: 'video/quicktime',
            },
          ],
        ],
      ]),
      new Map([
        [
          'message-1',
          [
            {
              alias: null,
              id: 'restored-attachment',
              name: 'clip.mov',
              previewUrl: null,
              signedUrl: null,
              size: 10,
              storagePath: 'ws/chats/ai/resources/temp/user/clip.mov',
              type: 'video/quicktime',
            },
          ],
        ],
      ])
    );

    expect(merged.get('message-1')).toEqual([
      expect.objectContaining({
        previewUrl: 'blob:video-preview',
        signedUrl: 'https://example.com/live.mov',
        storagePath: 'ws/chats/ai/resources/temp/user/clip.mov',
        type: 'video/quicktime',
      }),
    ]);
  });
});
