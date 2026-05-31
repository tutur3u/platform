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
  documentsList: vi.fn(),
  isAiMemoryEnabledForScope: vi.fn(),
  searchMemories: vi.fn(),
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
  getSupermemoryClient: () => ({
    add: memoryMocks.add,
    documents: {
      list: memoryMocks.documentsList,
    },
    search: {
      memories: memoryMocks.searchMemories,
    },
  }),
}));

vi.mock('./settings', () => ({
  isAiMemoryEnabledForScope: memoryMocks.isAiMemoryEnabledForScope,
}));

const scope = resolveAiMemoryScope({
  customId: 'chat-1',
  product: 'mira',
  source: 'test',
  surface: 'test',
  userId: 'user-1',
  wsId: 'ws-1',
});

describe('Supermemory operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
