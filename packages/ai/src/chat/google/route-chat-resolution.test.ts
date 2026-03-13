import { describe, expect, it, vi } from 'vitest';
import { moveTempFilesToThread } from './route-chat-resolution';

describe('moveTempFilesToThread', () => {
  it('moves every temp file into the chat folder when a thread exists', async () => {
    const loadThread = vi.fn().mockResolvedValue({
      data: [{ role: 'user' }],
      error: null,
    });
    const listFiles = vi.fn().mockResolvedValue({
      data: [{ name: 'one.pdf' }, { name: 'two.png' }],
      error: null,
    });
    const moveFile = vi.fn().mockResolvedValue({ error: null });

    const response = await moveTempFilesToThread({
      loadThread,
      listFiles,
      moveFile,
      wsId: '00000000-0000-0000-0000-000000000001',
      chatId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-1',
    });

    expect(response).toBeNull();
    expect(listFiles).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/temp/user-1'
    );
    expect(moveFile).toHaveBeenCalledTimes(2);
    expect(moveFile).toHaveBeenNthCalledWith(
      1,
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/temp/user-1/one.pdf',
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/11111111-1111-1111-1111-111111111111/one.pdf'
    );
    expect(moveFile).toHaveBeenNthCalledWith(
      2,
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/temp/user-1/two.png',
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/11111111-1111-1111-1111-111111111111/two.png'
    );
  });

  it('skips storage listing when the workspace id is absent', async () => {
    const loadThread = vi.fn();
    const listFiles = vi.fn();
    const moveFile = vi.fn();

    const response = await moveTempFilesToThread({
      loadThread,
      listFiles,
      moveFile,
      wsId: undefined,
      chatId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-1',
    });

    expect(response).toBeNull();
    expect(loadThread).not.toHaveBeenCalled();
    expect(listFiles).not.toHaveBeenCalled();
    expect(moveFile).not.toHaveBeenCalled();
  });
});
