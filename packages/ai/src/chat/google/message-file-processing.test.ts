import { describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { injectReferencedChatFilesIntoMessages } from './message-file-processing';

describe('injectReferencedChatFilesIntoMessages', () => {
  it('injects prior loaded audio files as native file parts for the next model step', async () => {
    createAdminClientMock.mockResolvedValue({
      storage: {
        from: () => ({
          download: async () => ({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], {
              type: 'audio/webm',
            }),
            error: null,
          }),
        }),
      },
    });

    const processedMessages = await injectReferencedChatFilesIntoMessages({
      chatFiles: [
        {
          introText:
            'Earlier chat file: project-update.webm (audio/webm). Analyze the actual file contents before answering.',
          name: 'project-update.webm',
          storagePath:
            'workspace-1/chats/ai/resources/chat-1/project-update.webm',
          type: 'audio/webm',
        },
      ],
      chatId: 'chat-1',
      messages: [
        {
          content: 'Rename the earlier audio based on what it says.',
          role: 'user',
        },
      ],
      wsId: 'workspace-1',
    });

    expect(processedMessages).toHaveLength(1);
    expect(processedMessages[0]).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            text: 'Rename the earlier audio based on what it says.',
            type: 'text',
          }),
          expect.objectContaining({
            text: expect.stringContaining(
              'Analyze the actual file contents before answering.'
            ),
            type: 'text',
          }),
          expect.objectContaining({
            mediaType: 'audio/webm',
            type: 'file',
          }),
        ],
        role: 'user',
      })
    );
  });
});
