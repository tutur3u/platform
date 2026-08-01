import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  resolveProvider: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  downloadWorkspaceStorageObjectForProvider: (...args: unknown[]) =>
    mocks.download(...args),
  resolveWorkspaceStorageProvider: (...args: unknown[]) =>
    mocks.resolveProvider(...args),
  uploadWorkspaceStorageFileDirect: (...args: unknown[]) =>
    mocks.upload(...args),
}));

import {
  consumeAiResponseTextDeltas,
  copyAiChatAttachmentInputsToResources,
} from './ai-message-shared';

describe('AI chat attachment resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProvider.mockResolvedValue({ provider: 'supabase' });
    mocks.download.mockResolvedValue({
      buffer: new Uint8Array([1]),
      contentType: 'text/plain',
    });
    mocks.upload.mockResolvedValue(undefined);
  });

  it('uses immutable keys when filenames and indexes repeat', async () => {
    const input = {
      attachments: [{ filename: 'notes.txt', path: 'uploads/notes.txt' }],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    };

    await copyAiChatAttachmentInputsToResources(input);
    await copyAiChatAttachmentInputsToResources(input);

    const firstPath = mocks.upload.mock.calls[0]?.[1];
    const secondPath = mocks.upload.mock.calls[1]?.[1];
    expect(firstPath).not.toBe(secondPath);
    expect(firstPath).toMatch(
      /^chats\/ai\/resources\/chat-1\/.+-0-notes\.txt$/u
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      'workspace-1',
      expect.any(String),
      expect.any(Uint8Array),
      expect.objectContaining({ upsert: false })
    );
  });

  it('fails the request when an attachment cannot be mirrored', async () => {
    mocks.download.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      copyAiChatAttachmentInputsToResources({
        attachments: [{ filename: 'notes.txt', path: 'uploads/notes.txt' }],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare a Chat attachment');
  });

  it('rejects attachment batches above the AI context byte budget', async () => {
    await expect(
      copyAiChatAttachmentInputsToResources({
        attachments: [
          {
            filename: 'large.bin',
            path: 'uploads/large.bin',
            sizeBytes: 100 * 1024 * 1024 + 1,
          },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('AI context size limit');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects when downloaded bytes exceed the AI context byte budget', async () => {
    mocks.download.mockResolvedValue({
      buffer: { byteLength: 100 * 1024 * 1024 + 1 },
      contentType: 'application/octet-stream',
    });

    await expect(
      copyAiChatAttachmentInputsToResources({
        attachments: [{ filename: 'large.bin', path: 'uploads/large.bin' }],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare a Chat attachment');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('AI response SSE parsing', () => {
  it('parses CRLF-delimited events', async () => {
    const response = new Response(
      'data: {"type":"text-delta","delta":"hello"}\r\n\r\n' +
        'data: {"type":"text-delta","delta":" world"}\r\n\r\n'
    );

    await expect(consumeAiResponseTextDeltas(response)).resolves.toBe(
      'hello world'
    );
  });
});
