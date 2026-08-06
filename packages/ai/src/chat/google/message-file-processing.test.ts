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
        limit: 100,
        offset: 0,
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

describe('resolveAttachmentMediaType', () => {
  it('trusts a media type storage actually recorded', async () => {
    const { resolveAttachmentMediaType } = await import(
      './message-file-processing'
    );
    expect(resolveAttachmentMediaType('shot.png', 'image/png')).toBe(
      'image/png'
    );
  });

  it('infers from the extension when storage lost the type', async () => {
    // An image stored as application/octet-stream used to miss the image/
    // check and reached the model as an "unsupported format" note.
    const { resolveAttachmentMediaType } = await import(
      './message-file-processing'
    );
    expect(
      resolveAttachmentMediaType('shot.png', 'application/octet-stream')
    ).toBe('image/png');
    expect(resolveAttachmentMediaType('clip.mp3', undefined)).toBe(
      'audio/mpeg'
    );
    expect(resolveAttachmentMediaType('scan.PDF', null)).toBe(
      'application/pdf'
    );
  });

  it('stays unknown when the extension means nothing', async () => {
    const { resolveAttachmentMediaType } = await import(
      './message-file-processing'
    );
    expect(resolveAttachmentMediaType('archive.xyz', undefined)).toBe(
      'application/octet-stream'
    );
  });
});

describe('listAllChatResourceFiles', () => {
  function clientReturning(pages: { name: string }[][]) {
    const list = vi.fn(
      async (_path: string, options: Record<string, unknown>) => {
        const page = Math.floor((options.offset as number) / 100);
        return { data: pages[page] ?? [], error: null };
      }
    );
    return {
      client: { storage: { from: () => ({ list }) } },
      list,
    };
  }

  it('pages past the 100-row storage default', async () => {
    const { listAllChatResourceFiles } = await import(
      './message-file-processing'
    );
    // The default limit is 100, so a chat with more resources than that used to
    // lose everything on later pages with no error.
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `file-${index}.png`,
    }));
    const { client, list } = clientReturning([
      firstPage,
      [{ name: 'file-100.png' }],
    ]);

    const { files } = await listAllChatResourceFiles(
      client as never,
      'ws/chat'
    );

    expect(files).toHaveLength(101);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1]?.[1]).toMatchObject({ limit: 100, offset: 100 });
  });

  it('stops after a short page without another request', async () => {
    const { listAllChatResourceFiles } = await import(
      './message-file-processing'
    );
    const { client, list } = clientReturning([[{ name: 'only.png' }]]);

    const { files } = await listAllChatResourceFiles(
      client as never,
      'ws/chat'
    );

    expect(files).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('keeps what it already paged when a later page errors', async () => {
    const { listAllChatResourceFiles } = await import(
      './message-file-processing'
    );
    const list = vi.fn(
      async (_path: string, options: Record<string, unknown>) =>
        (options.offset as number) === 0
          ? {
              data: Array.from({ length: 100 }, (_, i) => ({
                name: `f${i}.png`,
              })),
              error: null,
            }
          : { data: null, error: new Error('boom') }
    );

    const { files } = await listAllChatResourceFiles(
      { storage: { from: () => ({ list }) } } as never,
      'ws/chat'
    );

    expect(files).toHaveLength(100);
  });
});
