import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: (
    ...args: Parameters<typeof mocks.uploadWorkspaceStorageFileDirect>
  ) => mocks.uploadWorkspaceStorageFileDirect(...args),
}));

import { mirrorExternalMessageAttachments } from './external-chat-attachments';

describe('mirrorExternalMessageAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath: 'workspace-1/AI Agent Imports/zalo/file.jpg',
      path: 'AI Agent Imports/zalo/file.jpg',
      provider: 'supabase',
    });
  });

  it('uploads measured media bytes to a deterministic workspace Drive path', async () => {
    const result = await mirrorExternalMessageAttachments({
      adapter: 'zalo',
      channelId: 'zalo-personal',
      externalMessageId: 'message-1',
      externalThreadId: 'thread-1',
      message: {
        attachments: [
          {
            fetchData: vi.fn(async () => Buffer.from('image-bytes')),
            mimeType: 'image/jpeg',
            name: 'class photo.jpg',
            type: 'image',
          },
        ],
      } as never,
      wsId: 'workspace-1',
    });

    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      expect.stringMatching(
        /^AI Agent Imports\/zalo\/zalo-personal\/[a-f0-9]{16}\/[a-f0-9]{16}-1-class photo\.jpg$/u
      ),
      expect.any(Uint8Array),
      { contentType: 'image/jpeg', upsert: true }
    );
    expect(result).toMatchObject([
      {
        contentType: 'image/jpeg',
        filename: 'class photo.jpg',
        sizeBytes: 11,
      },
    ]);
  });

  it('skips oversized attachments before downloading', async () => {
    const fetchData = vi.fn();
    const result = await mirrorExternalMessageAttachments({
      adapter: 'zalo',
      channelId: 'zalo-personal',
      externalMessageId: 'message-1',
      externalThreadId: 'thread-1',
      message: {
        attachments: [
          {
            fetchData,
            size: 25 * 1024 * 1024 + 1,
            type: 'video',
          },
        ],
      } as never,
      wsId: 'workspace-1',
    });

    expect(fetchData).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
