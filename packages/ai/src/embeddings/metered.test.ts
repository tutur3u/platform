import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMeteredTextEmbedding,
  GEMINI_EMBEDDING_2_DIMENSIONS,
  GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
  GEMINI_EMBEDDING_2_MODEL_ID,
} from './metered';

const mocks = vi.hoisted(() => ({
  checkAiCredits: vi.fn(),
  commitMeteredEmbeddingCredits: vi.fn(),
  embed: vi.fn(),
  googleEmbedding: vi.fn(),
  releaseMeteredEmbeddingCredits: vi.fn(),
  reserveMeteredEmbeddingCredits: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: {
    embedding: mocks.googleEmbedding,
  },
}));

vi.mock('ai', () => ({
  embed: mocks.embed,
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.checkAiCredits,
}));

vi.mock('@tuturuuu/ai/credits/reservations', () => ({
  commitMeteredEmbeddingCredits: mocks.commitMeteredEmbeddingCredits,
  releaseMeteredEmbeddingCredits: mocks.releaseMeteredEmbeddingCredits,
  reserveMeteredEmbeddingCredits: mocks.reserveMeteredEmbeddingCredits,
}));

function embeddingVector() {
  return Array.from({ length: GEMINI_EMBEDDING_2_DIMENSIONS }, (_, index) =>
    Number((index / GEMINI_EMBEDDING_2_DIMENSIONS).toFixed(6))
  );
}

function stubTokenCount(tokens = 11) {
  const fetchMock = vi.fn(async () => ({
    json: async () => ({ totalTokens: tokens }),
    ok: true,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createMeteredTextEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: null,
      remainingCredits: 100,
      tier: 'PRO',
    });
    mocks.reserveMeteredEmbeddingCredits.mockResolvedValue({
      costUsd: 0.0000022,
      creditsReserved: 1,
      errorCode: null,
      remainingCredits: 99,
      reservationId: 'reservation-1',
      success: true,
    });
    mocks.commitMeteredEmbeddingCredits.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 99,
      success: true,
    });
    mocks.releaseMeteredEmbeddingCredits.mockResolvedValue({
      errorCode: null,
      remainingCredits: 100,
      success: true,
    });
    mocks.googleEmbedding.mockImplementation((modelId: string) => ({
      modelId,
    }));
    mocks.embed.mockResolvedValue({
      embedding: embeddingVector(),
      usage: { tokens: 11 },
    });
    stubTokenCount();
  });

  it('skips before token counting when billable scope is missing', async () => {
    const result = await createMeteredTextEmbedding({
      source: 'task_embedding',
      taskType: 'RETRIEVAL_DOCUMENT',
      value: 'hello',
      wsId: 'ws-1',
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'missing_scope',
      structuralDisable: true,
    });
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('skips before Google calls when pricing or model access is unavailable', async () => {
    mocks.checkAiCredits.mockResolvedValue({
      allowed: false,
      errorCode: 'MODEL_PRICING_UNAVAILABLE',
      errorMessage: 'No price',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'PRO',
    });

    const result = await createMeteredTextEmbedding({
      source: 'ai_memory',
      taskType: 'RETRIEVAL_QUERY',
      userId: 'user-1',
      value: 'find this',
      wsId: 'ws-1',
    });

    expect(result).toMatchObject({
      errorCode: 'MODEL_PRICING_UNAVAILABLE',
      ok: false,
      reason: 'credit_check_failed',
      structuralDisable: true,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.reserveMeteredEmbeddingCredits).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('counts, reserves, embeds, and commits in order on success', async () => {
    const fetchMock = stubTokenCount(13);

    const result = await createMeteredTextEmbedding({
      metadata: { taskId: 'task-1' },
      source: 'task_embedding',
      taskType: 'RETRIEVAL_DOCUMENT',
      userId: 'user-1',
      value: 'Index this task',
      wsId: 'ws-1',
    });

    expect(result).toMatchObject({
      creditsDeducted: 1,
      inputTokens: 13,
      modelId: GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.reserveMeteredEmbeddingCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 13,
        modelId: GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
    expect(mocks.googleEmbedding).toHaveBeenCalledWith(
      GEMINI_EMBEDDING_2_MODEL_ID
    );
    expect(mocks.embed).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          google: {
            outputDimensionality: GEMINI_EMBEDDING_2_DIMENSIONS,
            taskType: 'RETRIEVAL_DOCUMENT',
          },
        },
      })
    );
    expect(mocks.commitMeteredEmbeddingCredits).toHaveBeenCalledWith(
      'reservation-1',
      expect.objectContaining({
        actualInputTokens: 11,
        source: 'task_embedding',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
    expect(mocks.releaseMeteredEmbeddingCredits).not.toHaveBeenCalled();
  });

  it('skips the provider call when reservation fails', async () => {
    mocks.reserveMeteredEmbeddingCredits.mockResolvedValue({
      costUsd: 0,
      creditsReserved: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
      remainingCredits: 0,
      reservationId: null,
      success: false,
    });

    const result = await createMeteredTextEmbedding({
      source: 'task_embedding',
      taskType: 'RETRIEVAL_DOCUMENT',
      userId: 'user-1',
      value: 'Index this task',
      wsId: 'ws-1',
    });

    expect(result).toMatchObject({
      errorCode: 'INSUFFICIENT_CREDITS',
      ok: false,
      reason: 'credits_exhausted',
    });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.releaseMeteredEmbeddingCredits).not.toHaveBeenCalled();
  });

  it('releases reserved credits when the provider fails', async () => {
    mocks.embed.mockRejectedValue(new Error('provider down'));

    const result = await createMeteredTextEmbedding({
      source: 'task_search',
      taskType: 'RETRIEVAL_QUERY',
      userId: 'user-1',
      value: 'find task',
      wsId: 'ws-1',
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'embedding_generation_failed',
    });
    expect(mocks.releaseMeteredEmbeddingCredits).toHaveBeenCalledWith(
      'reservation-1',
      expect.objectContaining({
        reason: 'embedding_generation_failed',
        source: 'task_search',
      })
    );
    expect(mocks.commitMeteredEmbeddingCredits).not.toHaveBeenCalled();
  });
});
