import { describe, expect, it, vi } from 'vitest';
import {
  moveTempFilesToThread,
  resolveChatIdForUser,
} from './route-chat-resolution';

describe('resolveChatIdForUser', () => {
  it('rejects client-only prefixed chat ids before database lookup', async () => {
    const fetchLatestChatId = vi.fn();
    const fetchRequestedChatId = vi.fn();

    const result = await resolveChatIdForUser(
      'learn-workspace-1-0-00000000-0000-0000-0000-000000000000',
      fetchLatestChatId,
      fetchRequestedChatId
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      await expect(result.error.text()).resolves.toBe(
        'Invalid chat identifier'
      );
    }
    expect(fetchLatestChatId).not.toHaveBeenCalled();
    expect(fetchRequestedChatId).not.toHaveBeenCalled();
  });

  it('rejects valid UUID chat ids that do not belong to the requester', async () => {
    const chatId = '11111111-1111-4111-8111-111111111111';
    const fetchLatestChatId = vi.fn();
    const fetchRequestedChatId = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await resolveChatIdForUser(
      chatId,
      fetchLatestChatId,
      fetchRequestedChatId
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(404);
      await expect(result.error.text()).resolves.toBe('Chat not found');
    }
    expect(fetchLatestChatId).not.toHaveBeenCalled();
    expect(fetchRequestedChatId).toHaveBeenCalledWith(chatId);
  });

  it('returns verified requester-owned chat ids', async () => {
    const chatId = '11111111-1111-4111-8111-111111111111';
    const fetchRequestedChatId = vi.fn().mockResolvedValue({
      data: { id: chatId },
      error: null,
    });

    await expect(
      resolveChatIdForUser(chatId, vi.fn(), fetchRequestedChatId)
    ).resolves.toEqual({ chatId });
  });
});

describe('moveTempFilesToThread', () => {
  it('moves files before the first message exists in a new chat', async () => {
    const listFiles = vi.fn().mockResolvedValue({
      data: [{ name: 'one.pdf' }, { name: 'two.png' }],
      error: null,
    });
    const moveFile = vi.fn().mockResolvedValue({ error: null });

    const response = await moveTempFilesToThread({
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
    const listFiles = vi.fn();
    const moveFile = vi.fn();

    const response = await moveTempFilesToThread({
      listFiles,
      moveFile,
      wsId: undefined,
      chatId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-1',
    });

    expect(response).toBeNull();
    expect(listFiles).not.toHaveBeenCalled();
    expect(moveFile).not.toHaveBeenCalled();
  });

  it('does not ask the model to answer when an attachment move fails', async () => {
    const listFiles = vi.fn().mockResolvedValue({
      data: [{ name: 'voice-message.m4a' }],
      error: null,
    });
    const moveFile = vi.fn().mockResolvedValue({
      error: { message: 'storage unavailable' },
    });

    const response = await moveTempFilesToThread({
      listFiles,
      moveFile,
      wsId: '00000000-0000-0000-0000-000000000001',
      chatId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-1',
    });

    expect(response?.status).toBe(502);
    expect(await response?.text()).toContain('Please retry');
  });
});
