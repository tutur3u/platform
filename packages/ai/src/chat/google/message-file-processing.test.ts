import type { ModelMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createClient = vi.fn();
  const adminDownload = vi.fn();
  const adminList = vi.fn();

  const adminSupabase = {
    storage: {
      from: vi.fn(() => ({
        list: adminList,
        download: adminDownload,
      })),
    },
  };

  return {
    adminDownload,
    adminList,
    adminSupabase,
    createClient,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

describe('processMessagesWithFiles', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reads chat files from storage with the admin client', async () => {
    mocks.adminList.mockResolvedValue({
      data: [
        {
          name: '1712345678_notes.txt',
          metadata: { mediaType: 'text/plain' },
        },
      ],
      error: null,
    });
    mocks.adminDownload.mockResolvedValue({
      data: new Blob(['Attached note'], { type: 'text/plain' }),
      error: null,
    });

    const { processMessagesWithFiles } = await import(
      './message-file-processing'
    );
    const inputMessages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Summarize the attached file',
      },
    ];

    const result = await processMessagesWithFiles(
      inputMessages,
      'ws-1',
      'chat-1'
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.adminSupabase.storage.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.adminList).toHaveBeenCalledWith(
      'ws-1/chats/ai/resources/chat-1',
      {
        sortBy: { column: 'created_at', order: 'asc' },
      }
    );
    expect(mocks.adminDownload).toHaveBeenCalledWith(
      'ws-1/chats/ai/resources/chat-1/1712345678_notes.txt'
    );
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0]?.content)).toBe(true);
  });
});
