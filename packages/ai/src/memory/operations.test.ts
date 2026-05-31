import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiMemoryContext,
  listAiMemories,
  rememberAiMemory,
  searchAiMemories,
} from './operations';
import { resolveAiMemoryScope } from './scope';

const memoryMocks = vi.hoisted(() => ({
  add: vi.fn(),
  createMeteredTextEmbedding: vi.fn(),
  disableAiMemoryForMeteringFailure: vi.fn(),
  documentsList: vi.fn(),
  isAiMemoryEnabledForScope: vi.fn(),
  searchMemories: vi.fn(),
  shouldDisableMemoryForMeteringReason: vi.fn(),
}));

vi.mock('./config', () => ({
  getAiMemoryConfig: () => ({
    apiKey: 'test-key',
    baseUrl: 'http://supermemory.internal',
    enabled: true,
    failOpen: true,
    timeoutMs: 1234,
  }),
}));

vi.mock('./client', () => ({
  getAiMemoryServiceClient: () => ({
    add: memoryMocks.add,
    forgetMemory: vi.fn(),
    listDocuments: memoryMocks.documentsList,
    searchMemories: memoryMocks.searchMemories,
  }),
}));

vi.mock('./settings', () => ({
  disableAiMemoryForMeteringFailure:
    memoryMocks.disableAiMemoryForMeteringFailure,
  isAiMemoryEnabledForScope: memoryMocks.isAiMemoryEnabledForScope,
}));

vi.mock('../embeddings/metered', () => ({
  createMeteredTextEmbedding: memoryMocks.createMeteredTextEmbedding,
  shouldDisableMemoryForMeteringReason:
    memoryMocks.shouldDisableMemoryForMeteringReason,
}));

const scope = resolveAiMemoryScope({
  customId: 'chat-1',
  product: 'mira',
  source: 'test',
  surface: 'test',
  userId: 'user-1',
  wsId: 'ws-1',
});

describe('AI memory operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.createMeteredTextEmbedding.mockResolvedValue({
      creditsDeducted: 1,
      embedding: Array.from({ length: 3072 }, () => 0.1),
      inputTokens: 8,
      modelId: 'google/gemini-embedding-2',
      ok: true,
    });
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(true);
    memoryMocks.searchMemories.mockResolvedValue({
      results: [
        {
          id: 'memory-1',
          memory: 'Prefers concise summaries',
          metadata: { memoryKey: 'style' },
          similarity: 0.9,
          updatedAt: '2026-05-31T00:00:00.000Z',
        },
      ],
    });
  });

  it('adds memory with normalized metadata and request timeout', async () => {
    memoryMocks.add.mockResolvedValue({ id: 'memory-1', status: 'queued' });

    const result = await rememberAiMemory({
      category: 'preference',
      key: 'style',
      scope,
      value: 'Prefers concise summaries',
    });

    expect(result).toMatchObject({ ok: true, value: { id: 'memory-1' } });
    expect(memoryMocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        containerTag: scope?.containerTag,
        content: '[preference] style: Prefers concise summaries',
        customId: scope?.customId,
        embedding: expect.arrayContaining([0.1]),
        metadata: expect.objectContaining({
          memoryCategory: 'preference',
          memoryKey: 'style',
          product: 'mira',
        }),
      }),
      expect.objectContaining({ timeout: 1234 })
    );
  });

  it('skips active reads and writes when memory is disabled', async () => {
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(false);

    await expect(
      rememberAiMemory({ scope, value: 'do not write' })
    ).resolves.toMatchObject({
      ok: true,
      reason: 'ai_memory_disabled',
      skipped: true,
    });

    expect(memoryMocks.add).not.toHaveBeenCalled();
  });

  it('skips writes before the sidecar when metering cannot reserve credits', async () => {
    memoryMocks.createMeteredTextEmbedding.mockResolvedValue({
      ok: false,
      reason: 'reservation_failed',
      skipped: true,
      structuralDisable: true,
    });
    memoryMocks.shouldDisableMemoryForMeteringReason.mockReturnValue(true);

    await expect(
      rememberAiMemory({ scope, value: 'do not write for free' })
    ).resolves.toMatchObject({
      ok: true,
      reason: 'reservation_failed',
      skipped: true,
      value: null,
    });

    expect(memoryMocks.add).not.toHaveBeenCalled();
    expect(memoryMocks.disableAiMemoryForMeteringFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'reservation_failed',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
  });

  it('lists documents using the container tag and product filter', async () => {
    memoryMocks.documentsList.mockResolvedValue({
      memories: [
        {
          content: 'style: concise',
          id: 'doc-1',
          metadata: { memoryCategory: 'preference', memoryKey: 'style' },
          status: 'done',
          summary: null,
          title: null,
          updatedAt: '2026-05-31T00:00:00.000Z',
        },
      ],
    });

    await expect(listAiMemories({ scope })).resolves.toMatchObject({
      ok: true,
      value: [{ content: 'style: concise', key: 'style' }],
    });
    expect(memoryMocks.documentsList).toHaveBeenCalledWith(
      expect.objectContaining({
        containerTags: [scope?.containerTag],
        filters: expect.objectContaining({ key: 'product', value: 'mira' }),
        includeContent: true,
      }),
      expect.any(Object)
    );
  });

  it('searches memories with the product filter by default', async () => {
    await expect(
      searchAiMemories({ query: 'style', scope })
    ).resolves.toMatchObject({
      ok: true,
      value: [{ key: 'style', value: 'Prefers concise summaries' }],
    });

    expect(memoryMocks.searchMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: expect.arrayContaining([0.1]),
        filters: expect.objectContaining({ key: 'product', value: 'mira' }),
      }),
      expect.any(Object)
    );
  });

  it('allows explicit cross-product memory search opt-out', async () => {
    await searchAiMemories({
      includeProductFilter: false,
      query: 'style',
      scope,
    });

    expect(memoryMocks.searchMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: undefined,
      }),
      expect.any(Object)
    );
  });

  it('builds memory context with the product filter by default', async () => {
    await expect(
      buildAiMemoryContext({ query: 'style', scope })
    ).resolves.toContain('Prefers concise summaries');

    expect(memoryMocks.searchMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ key: 'product', value: 'mira' }),
      }),
      expect.any(Object)
    );
  });

  it('fails open when search context retrieval fails', async () => {
    await expect(
      buildAiMemoryContext({ query: 'style', scope: null })
    ).resolves.toBe('');
  });
});
