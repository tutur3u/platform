import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  executeListChatFiles,
  executeLoadChatFile,
  executeRenameChatFile,
} from './chat-files';

describe('executeListChatFiles', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });

  it('treats wildcard-only queries as an unfiltered file listing', async () => {
    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'ai_chat_messages') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    created_at: '2026-03-03T19:00:00.000Z',
                    id: 'message-1',
                    metadata: {
                      attachments: [
                        {
                          name: 'meeting.wav',
                          size: 42,
                          storagePath:
                            'workspace-1/chats/ai/resources/chat-1/meeting.wav',
                          type: 'audio/wav',
                        },
                      ],
                    },
                    role: 'USER',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      },
      storage: {
        from: () => ({
          list: async () => ({
            data: [
              {
                created_at: '2026-03-03T19:00:01.000Z',
                id: 'meeting.wav',
                metadata: {
                  mimetype: 'audio/wav',
                  size: 42,
                },
                name: 'meeting.wav',
              },
            ],
            error: null,
          }),
        }),
      },
    });

    const result = await executeListChatFiles({ query: '*' }, {
      chatId: 'chat-1',
      wsId: 'workspace-1',
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            fileName: 'meeting.wav',
          }),
        ],
        ok: true,
      })
    );
  });

  it('lists files from persisted attachment metadata even when storage listing is empty', async () => {
    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'ai_chat_messages') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    created_at: '2026-03-03T19:00:00.000Z',
                    id: 'message-1',
                    metadata: {
                      attachments: [
                        {
                          name: '1772566303974_mira-audio.webm',
                          size: 42,
                          storagePath:
                            'workspace-1/chats/ai/resources/temp/user-1/1772566303974_mira-audio.webm',
                          type: 'audio/webm',
                        },
                      ],
                    },
                    role: 'USER',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      },
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
        }),
      },
    });

    const result = await executeListChatFiles({}, {
      chatId: 'chat-1',
      wsId: 'workspace-1',
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            fileName: 'mira-audio.webm',
            messageId: 'message-1',
            storagePath:
              'workspace-1/chats/ai/resources/temp/user-1/1772566303974_mira-audio.webm',
            turnIndex: 1,
          }),
        ],
        ok: true,
      })
    );
  });

  it('loads a prior audio file back into native model context', async () => {
    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'ai_chat_messages') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    created_at: '2026-03-03T19:31:44.046Z',
                    id: 'message-1',
                    metadata: {
                      attachments: [
                        {
                          name: '1772566303974_mira-audio.webm',
                          size: 41827,
                          storagePath:
                            'workspace-1/chats/ai/resources/chat-1/1772566303974_mira-audio.webm',
                          type: 'audio/webm',
                        },
                      ],
                    },
                    role: 'USER',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      },
      storage: {
        from: () => ({
          download: async () => ({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], {
              type: 'audio/webm',
            }),
            error: null,
          }),
          list: async () => ({ data: [], error: null }),
        }),
      },
    });

    const result = await executeLoadChatFile(
      {
        storagePath:
          'workspace-1/chats/ai/resources/chat-1/1772566303974_mira-audio.webm',
      },
      {
        chatId: 'chat-1',
        wsId: 'workspace-1',
      } as never
    );

    expect(result).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          displayName: 'mira-audio.webm',
          fileName: 'mira-audio.webm',
          nativeLoadingSupported: true,
          storagePath:
            'workspace-1/chats/ai/resources/chat-1/1772566303974_mira-audio.webm',
        }),
        ok: true,
      })
    );
  });
});

describe('executeRenameChatFile', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });

  it('updates the stored attachment alias for the selected chat file', async () => {
    const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const chatMessages = [
      {
        created_at: '2026-03-03T19:00:00.000Z',
        id: 'message-1',
        metadata: {
          attachments: [
            {
              name: 'meeting.wav',
              size: 42,
              storagePath: 'workspace-1/chats/ai/resources/chat-1/meeting.wav',
              type: 'audio/wav',
            },
          ],
          source: 'Mira',
        },
        role: 'USER',
      },
    ];

    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'ai_chat_messages') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: chatMessages, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              updates.push({ id, payload });
              return { error: null };
            },
          }),
        };
      },
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
        }),
      },
    });

    const result = await executeRenameChatFile(
      {
        fileName: 'meeting.wav',
        newName: 'Standup Recording',
      },
      {
        chatId: 'chat-1',
        wsId: 'workspace-1',
      } as never
    );

    expect(result).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          displayName: 'Standup Recording',
          fileName: 'meeting.wav',
        }),
        ok: true,
      })
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(
      expect.objectContaining({
        id: 'message-1',
        payload: {
          metadata: {
            attachments: [
              expect.objectContaining({
                alias: 'Standup Recording',
                name: 'meeting.wav',
              }),
            ],
            source: 'Mira',
          },
        },
      })
    );
  });
});
