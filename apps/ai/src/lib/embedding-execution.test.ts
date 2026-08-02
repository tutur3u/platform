import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gatewayEmbedding: vi.fn((modelId: string) => ({ modelId, route: 'gateway' })),
  googleEmbedding: vi.fn((modelId: string) => ({ modelId, route: 'google' })),
}));

vi.mock('@ai-sdk/google', () => ({
  google: { embedding: mocks.googleEmbedding },
}));

vi.mock('ai', () => ({
  embedMany: vi.fn(),
  gateway: { embedding: mocks.gatewayEmbedding },
}));

vi.mock('./public-api', () => ({
  approximateTokenCount: vi.fn(),
  captureAiStudioContent: vi.fn(),
  prepareMeteredExecution: vi.fn(),
  publicApiError: vi.fn(),
  settleMeteredExecution: vi.fn(),
}));

import { resolveEmbeddingModel } from './embedding-execution';

describe('embedding provider routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes Gemini Embedding 2 through the configured Google credential', () => {
    expect(resolveEmbeddingModel('google/gemini-embedding-2')).toEqual({
      modelId: 'gemini-embedding-2',
      route: 'google',
    });
    expect(mocks.googleEmbedding).toHaveBeenCalledWith('gemini-embedding-2');
    expect(mocks.gatewayEmbedding).not.toHaveBeenCalled();
  });

  it('keeps other embedding models on AI Gateway', () => {
    expect(
      resolveEmbeddingModel('google/text-multilingual-embedding-002')
    ).toEqual({
      modelId: 'google/text-multilingual-embedding-002',
      route: 'gateway',
    });
    expect(mocks.gatewayEmbedding).toHaveBeenCalledWith(
      'google/text-multilingual-embedding-002'
    );
    expect(mocks.googleEmbedding).not.toHaveBeenCalled();
  });
});
