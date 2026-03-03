import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkAiCreditsMock,
  deductAiCreditsMock,
  digestChatFileWithGeminiMock,
  getReadyChatFileDigestMock,
  resolveAttachmentForDigestMock,
  saveFailedChatFileDigestMock,
  saveReadyChatFileDigestMock,
  upsertProcessingChatFileDigestMock,
} = vi.hoisted(() => ({
  checkAiCreditsMock: vi.fn(),
  deductAiCreditsMock: vi.fn(),
  digestChatFileWithGeminiMock: vi.fn(),
  getReadyChatFileDigestMock: vi.fn(),
  resolveAttachmentForDigestMock: vi.fn(),
  saveFailedChatFileDigestMock: vi.fn(),
  saveReadyChatFileDigestMock: vi.fn(),
  upsertProcessingChatFileDigestMock: vi.fn(),
}));

vi.mock('../../credits/check-credits', () => ({
  checkAiCredits: checkAiCreditsMock,
  deductAiCredits: deductAiCreditsMock,
}));

vi.mock('./cache', () => ({
  getReadyChatFileDigest: getReadyChatFileDigestMock,
  saveFailedChatFileDigest: saveFailedChatFileDigestMock,
  saveReadyChatFileDigest: saveReadyChatFileDigestMock,
  upsertProcessingChatFileDigest: upsertProcessingChatFileDigestMock,
}));

vi.mock('./worker', () => ({
  digestChatFileWithGemini: digestChatFileWithGeminiMock,
  resolveAttachmentForDigest: resolveAttachmentForDigestMock,
}));

import { ensureChatFileDigest } from './ensure';

describe('ensureChatFileDigest', () => {
  beforeEach(() => {
    checkAiCreditsMock.mockReset();
    deductAiCreditsMock.mockReset();
    digestChatFileWithGeminiMock.mockReset();
    getReadyChatFileDigestMock.mockReset();
    resolveAttachmentForDigestMock.mockReset();
    saveFailedChatFileDigestMock.mockReset();
    saveReadyChatFileDigestMock.mockReset();
    upsertProcessingChatFileDigestMock.mockReset();
    resolveAttachmentForDigestMock.mockImplementation(
      async ({ attachment }) => attachment
    );
  });

  it('returns cached digests without reprocessing', async () => {
    getReadyChatFileDigestMock.mockResolvedValue({
      answerContextMarkdown: 'Cached summary',
      digestVersion: 1,
      displayName: 'memo.wav',
      extractedMarkdown: null,
      fileName: 'memo.wav',
      keyFacts: [],
      limitations: [],
      mediaType: 'audio/wav',
      processorModel: 'google/gemini-3.1-flash-lite-preview',
      status: 'ready',
      storagePath: 'ws/chats/ai/resources/chat-1/memo.wav',
      suggestedAlias: null,
      summary: 'Cached',
      title: 'Memo',
    });

    const result = await ensureChatFileDigest({
      attachment: {
        name: 'memo.wav',
        storagePath: 'ws/chats/ai/resources/chat-1/memo.wav',
        type: 'audio/wav',
      },
      chatId: 'chat-1',
      creditWsId: 'ws',
      userId: 'user-1',
      wsId: 'ws',
    });

    expect(result).toEqual(
      expect.objectContaining({
        cached: true,
        ok: true,
      })
    );
    expect(digestChatFileWithGeminiMock).not.toHaveBeenCalled();
  });

  it('processes and persists a digest on cache miss', async () => {
    getReadyChatFileDigestMock.mockResolvedValue(null);
    checkAiCreditsMock.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 4096,
      remainingCredits: 10_000,
      tier: 'FREE',
    });
    digestChatFileWithGeminiMock.mockResolvedValue({
      answerContextMarkdown: 'The recording says the launch is on Friday.',
      extractedMarkdown: null,
      keyFacts: ['Launch is on Friday'],
      limitations: [],
      suggestedAlias: 'Launch Update',
      summary: 'Brief launch update.',
      title: 'Launch Update',
      usage: {
        inputTokens: 100,
        outputTokens: 40,
        reasoningTokens: 0,
      },
    });
    deductAiCreditsMock.mockResolvedValue({
      creditsDeducted: 10,
      errorCode: null,
      remainingCredits: 9990,
      success: true,
    });
    saveReadyChatFileDigestMock.mockResolvedValue({
      answerContextMarkdown: 'The recording says the launch is on Friday.',
      digestVersion: 1,
      displayName: 'launch.wav',
      extractedMarkdown: null,
      fileName: 'launch.wav',
      keyFacts: ['Launch is on Friday'],
      limitations: [],
      mediaType: 'audio/wav',
      processorModel: 'google/gemini-3.1-flash-lite-preview',
      status: 'ready',
      storagePath: 'ws/chats/ai/resources/chat-1/launch.wav',
      suggestedAlias: 'Launch Update',
      summary: 'Brief launch update.',
      title: 'Launch Update',
    });

    const result = await ensureChatFileDigest({
      attachment: {
        name: 'launch.wav',
        storagePath: 'ws/chats/ai/resources/chat-1/launch.wav',
        type: 'audio/wav',
      },
      chatId: 'chat-1',
      creditWsId: 'ws',
      messageId: 'message-1',
      userId: 'user-1',
      wsId: 'ws',
    });

    expect(result).toEqual(
      expect.objectContaining({
        cached: false,
        ok: true,
      })
    );
    expect(upsertProcessingChatFileDigestMock).toHaveBeenCalled();
    expect(deductAiCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMessageId: 'message-1',
        modelId: 'google/gemini-3.1-flash-lite-preview',
      })
    );
    expect(saveReadyChatFileDigestMock).toHaveBeenCalled();
  });

  it('bypasses the ready-cache lookup when forceRefresh is true', async () => {
    checkAiCreditsMock.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 4096,
      remainingCredits: 10_000,
      tier: 'FREE',
    });
    digestChatFileWithGeminiMock.mockResolvedValue({
      answerContextMarkdown: 'Fresh digest',
      extractedMarkdown: null,
      keyFacts: ['Fresh fact'],
      limitations: [],
      suggestedAlias: null,
      summary: 'Fresh summary',
      title: 'Fresh title',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 0,
      },
    });
    deductAiCreditsMock.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 999,
      success: true,
    });
    saveReadyChatFileDigestMock.mockResolvedValue({
      answerContextMarkdown: 'Fresh digest',
      digestVersion: 1,
      displayName: 'memo.wav',
      extractedMarkdown: null,
      fileName: 'memo.wav',
      keyFacts: ['Fresh fact'],
      limitations: [],
      mediaType: 'audio/wav',
      processorModel: 'google/gemini-3.1-flash-lite-preview',
      status: 'ready',
      storagePath: 'ws/chats/ai/resources/chat-1/memo.wav',
      suggestedAlias: null,
      summary: 'Fresh summary',
      title: 'Fresh title',
    });

    await ensureChatFileDigest({
      attachment: {
        name: 'memo.wav',
        storagePath: 'ws/chats/ai/resources/chat-1/memo.wav',
        type: 'audio/wav',
      },
      chatId: 'chat-1',
      forceRefresh: true,
      userId: 'user-1',
      wsId: 'ws',
    });

    expect(getReadyChatFileDigestMock).not.toHaveBeenCalled();
    expect(digestChatFileWithGeminiMock).toHaveBeenCalled();
  });
});
