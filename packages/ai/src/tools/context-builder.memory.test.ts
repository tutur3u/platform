import type { SupabaseClient } from '@tuturuuu/supabase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMiraContext } from './context-builder';

const memoryMocks = vi.hoisted(() => ({
  createMeteredTextEmbedding: vi.fn(),
  isAiMemoryEnabledForScope: vi.fn(),
  searchMemories: vi.fn(),
}));

vi.mock('../memory/config', () => ({
  getAiMemoryConfig: () => ({
    apiKey: 'test-key',
    enabled: true,
    failOpen: true,
    timeoutMs: 1500,
  }),
  isAiMemoryConfigured: () => true,
}));

vi.mock('../memory/client', () => ({
  getAiMemoryServiceClient: () => ({
    searchMemories: memoryMocks.searchMemories,
  }),
  getSupermemoryClient: vi.fn(),
}));

vi.mock('../memory/settings', () => ({
  disableAiMemoryForMeteringFailure: vi.fn(),
  getAiMemorySettings: vi.fn(),
  isAiMemoryEnabledForScope: memoryMocks.isAiMemoryEnabledForScope,
}));

vi.mock('../embeddings/metered', () => ({
  createMeteredTextEmbedding: memoryMocks.createMeteredTextEmbedding,
  shouldDisableMemoryForMeteringReason: () => false,
}));

function emptyQuery(): unknown {
  const result = { data: null, error: null };
  const builder = Object.assign(Promise.resolve(result), {
    maybeSingle: async () => result,
  });
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) {
    Object.assign(builder, { [method]: () => builder });
  }
  return builder;
}

const supabase = {
  from: () => emptyQuery(),
  rpc: async () => ({ data: [], error: null }),
  schema() {
    return this;
  },
} as unknown as SupabaseClient;

function build(latestUserMessage?: string) {
  return buildMiraContext({
    latestUserMessage,
    supabase,
    userId: 'user-1',
    withoutPermission: () => false,
    wsId: 'workspace-1',
  });
}

describe('buildMiraContext memory metering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(true);
    memoryMocks.createMeteredTextEmbedding.mockResolvedValue({
      creditsDeducted: 1,
      embedding: [0.1, 0.2],
      inputTokens: 6,
      modelId: 'google/gemini-embedding-2',
      ok: true,
    });
    memoryMocks.searchMemories.mockResolvedValue({
      results: [
        {
          id: 'memory-1',
          memory: 'Prefers metric units',
          metadata: { memoryKey: 'units' },
        },
      ],
    });
  });

  it('checks no consent, meters no embedding and searches nothing for a greeting', async () => {
    const context = await build('Hello!');

    expect(memoryMocks.isAiMemoryEnabledForScope).not.toHaveBeenCalled();
    expect(memoryMocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(memoryMocks.searchMemories).not.toHaveBeenCalled();
    expect(context.contextString).not.toContain('Prefers metric units');
  });

  it('meters a memory-needing turn exactly like the eager build', async () => {
    const eager = await build();
    const eagerCalls = structuredClone(
      memoryMocks.createMeteredTextEmbedding.mock.calls
    );
    const eagerSearches = structuredClone(
      memoryMocks.searchMemories.mock.calls
    );
    vi.clearAllMocks();

    const lazy = await build('what units do I prefer?');

    expect(eagerCalls).toHaveLength(1);
    expect(memoryMocks.createMeteredTextEmbedding.mock.calls).toEqual(
      eagerCalls
    );
    expect(memoryMocks.createMeteredTextEmbedding).toHaveBeenCalledWith({
      metadata: { operation: 'search', product: 'mira' },
      source: 'ai_memory',
      taskType: 'RETRIEVAL_QUERY',
      userId: 'user-1',
      value: 'user preferences facts conversation history',
      wsId: 'workspace-1',
    });
    expect(memoryMocks.searchMemories.mock.calls).toEqual(eagerSearches);
    expect(memoryMocks.isAiMemoryEnabledForScope).toHaveBeenCalledWith({
      product: 'mira',
      userId: 'user-1',
      wsId: 'workspace-1',
    });
    expect(lazy.contextString).toContain('- units: Prefers metric units');
    expect(eager.contextString).toContain('- units: Prefers metric units');
  });

  it('respects disabled memory consent without metering when the turn needs memory', async () => {
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(false);

    const context = await build('what do you remember about me?');

    expect(memoryMocks.isAiMemoryEnabledForScope).toHaveBeenCalledTimes(1);
    expect(memoryMocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(memoryMocks.searchMemories).not.toHaveBeenCalled();
    expect(context.contextString).not.toContain('## User Memories');
  });
});
