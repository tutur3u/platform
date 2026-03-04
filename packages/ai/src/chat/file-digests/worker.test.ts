import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { resolveAttachmentForDigest } from './worker';

describe('resolveAttachmentForDigest', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });

  it('rewrites stale temp chat paths to the durable chat resource path', async () => {
    createAdminClientMock.mockResolvedValue({
      storage: {
        from: (bucket: string) => {
          if (bucket !== 'workspaces') {
            throw new Error(`Unexpected bucket: ${bucket}`);
          }

          return {
            list: async () => ({
              data: [
                {
                  name: '1772573133179_mira-audio-2026-03-03T21-25-33-071Z.webm',
                },
              ],
              error: null,
            }),
          };
        },
      },
      from: (table: string) => {
        if (table !== 'ai_chat_messages') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  metadata: {
                    attachments: [
                      {
                        name: 'mira-audio-2026-03-03T21-25-33-071Z.webm',
                        storagePath:
                          'workspace-1/chats/ai/resources/chat-1/1772573133179_mira-audio-2026-03-03T21-25-33-071Z.webm',
                        type: 'audio/webm',
                      },
                    ],
                  },
                },
              ],
              error: null,
            }),
          }),
        };
      },
    });

    const resolved = await resolveAttachmentForDigest({
      attachment: {
        name: 'mira-audio-2026-03-03T21-25-33-071Z.webm',
        storagePath:
          'workspace-1/chats/ai/resources/temp/user-1/1772573133179_mira-audio-2026-03-03T21-25-33-071Z.webm',
        type: 'audio/webm',
      },
      chatId: 'chat-1',
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(resolved.storagePath).toBe(
      'workspace-1/chats/ai/resources/chat-1/1772573133179_mira-audio-2026-03-03T21-25-33-071Z.webm'
    );
  });
});
