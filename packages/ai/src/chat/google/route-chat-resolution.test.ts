import { describe, expect, it, vi } from 'vitest';
import { moveTempFilesToThread } from './route-chat-resolution';

describe('moveTempFilesToThread', () => {
  it('moves temp files for the first streamed turn and returns rewritten paths', async () => {
    const moveFile = vi.fn(async () => ({ error: null }));

    const result = await moveTempFilesToThread({
      listFiles: async () => ({
        data: [{ name: '1772564518861_image.png' }],
        error: null,
      }),
      moveFile,
      wsId: 'workspace-1',
      chatId: 'chat-1',
      userId: 'user-1',
    });

    expect(result.error).toBeNull();
    if (result.error) {
      throw result.error;
    }
    expect(moveFile).toHaveBeenCalledWith(
      'workspace-1/chats/ai/resources/temp/user-1/1772564518861_image.png',
      'workspace-1/chats/ai/resources/chat-1/1772564518861_image.png'
    );
    expect(
      result.movedPaths.get(
        'workspace-1/chats/ai/resources/temp/user-1/1772564518861_image.png'
      )
    ).toBe('workspace-1/chats/ai/resources/chat-1/1772564518861_image.png');
  });

  it('returns an error when listing temp files fails', async () => {
    const result = await moveTempFilesToThread({
      listFiles: async () => ({
        data: null,
        error: { message: 'list failed' },
      }),
      moveFile: async () => ({ error: null }),
      wsId: 'workspace-1',
      chatId: 'chat-1',
      userId: 'user-1',
    });

    expect(result.error).toBeInstanceOf(Response);
    if (!result.error) {
      throw new Error('Expected error response');
    }
    await expect(result.error.text()).resolves.toBe('list failed');
  });

  it('returns an empty rewrite map when wsId is missing', async () => {
    const result = await moveTempFilesToThread({
      listFiles: async () => ({
        data: [{ name: 'ignored.png' }],
        error: null,
      }),
      moveFile: async () => ({ error: null }),
      wsId: '',
      chatId: 'chat-1',
      userId: 'user-1',
    });

    expect(result.error).toBeNull();
    if (result.error) {
      throw result.error;
    }
    expect(result.movedPaths.size).toBe(0);
  });

  it('returns an empty rewrite map when there are no temp files', async () => {
    const result = await moveTempFilesToThread({
      listFiles: async () => ({
        data: [],
        error: null,
      }),
      moveFile: async () => ({ error: null }),
      wsId: 'workspace-1',
      chatId: 'chat-1',
      userId: 'user-1',
    });

    expect(result.error).toBeNull();
    if (result.error) {
      throw result.error;
    }
    expect(result.movedPaths.size).toBe(0);
  });

  it('continues when some file moves fail and rewrites the successful subset', async () => {
    const moveFile = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'move failed' } });

    const result = await moveTempFilesToThread({
      listFiles: async () => ({
        data: [{ name: 'first.png' }, { name: 'second.png' }],
        error: null,
      }),
      moveFile,
      wsId: 'workspace-1',
      chatId: 'chat-1',
      userId: 'user-1',
    });

    expect(result.error).toBeNull();
    if (result.error) {
      throw result.error;
    }
    expect(result.movedPaths.size).toBe(1);
    expect(
      result.movedPaths.get(
        'workspace-1/chats/ai/resources/temp/user-1/first.png'
      )
    ).toBe('workspace-1/chats/ai/resources/chat-1/first.png');
  });
});
