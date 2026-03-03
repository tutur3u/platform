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
});
