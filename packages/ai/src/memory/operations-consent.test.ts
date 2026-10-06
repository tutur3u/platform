import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberAiMemory, searchAiMemories } from './operations';
import { resolveAiMemoryScope } from './scope';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  embed: vi.fn(),
  rpc: vi.fn(),
  search: vi.fn(),
}));

// Keep the actual settings module and its operation admission path. Only the
// network/storage boundaries are synthetic; no provider is invoked.
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock('./config', () => ({
  getAiMemoryConfig: () => ({
    apiKey: 'synthetic-fixture',
    baseUrl: 'http://memory.test',
    enabled: true,
    failOpen: true,
    timeoutMs: 100,
  }),
}));
vi.mock('./client', () => ({
  getAiMemoryServiceClient: () => ({
    add: mocks.add,
    searchMemories: mocks.search,
  }),
}));
vi.mock('../embeddings/metered', () => ({
  createMeteredTextEmbedding: mocks.embed,
  shouldDisableMemoryForMeteringReason: () => false,
}));

const scope = resolveAiMemoryScope({
  product: 'mira',
  source: 'synthetic-regression',
  surface: 'test',
  userId: 'synthetic-actor',
  wsId: 'synthetic-workspace',
});

async function expectNoAdmission() {
  await expect(
    rememberAiMemory({ scope, value: 'Synthetic preference' })
  ).resolves.toMatchObject({ ok: true, skipped: true, value: null });
  await expect(
    searchAiMemories({ scope, query: 'Synthetic preference' })
  ).resolves.toMatchObject({ ok: true, skipped: true, value: [] });
  expect(mocks.embed).not.toHaveBeenCalled();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith('get_ai_memory_settings', {
    p_product: 'mira',
    p_user_id: 'synthetic-actor',
    p_ws_id: 'synthetic-workspace',
  });
}

describe('actual memory settings operation admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.embed.mockResolvedValue({
      ok: true,
      embedding: [0.1],
      creditsDeducted: 1,
      inputTokens: 1,
      modelId: 'synthetic-embedding',
    });
    mocks.add.mockResolvedValue({ id: 'synthetic-memory', status: 'done' });
    mocks.search.mockResolvedValue({ results: [] });
  });

  it('denies embedding and store access when the actual settings RPC errors', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Synthetic unavailable settings' },
    });
    await expectNoAdmission();
  });

  it('denies embedding and store access when the actual settings RPC throws', async () => {
    mocks.rpc.mockRejectedValue(
      new Error('Synthetic settings transport failure')
    );
    await expectNoAdmission();
  });

  for (const row of [
    { enabled: false, product_enabled: true },
    { enabled: true, product_enabled: false },
    { enabled: true, products: { mira: false, ai_chat: true } },
  ]) {
    it(`respects existing disabled settings ${JSON.stringify(row)}`, async () => {
      mocks.rpc.mockResolvedValue({ data: [row], error: null });
      await expectNoAdmission();
    });
  }

  for (const data of [null, []]) {
    it(`retains successful missing-row compatibility for ${JSON.stringify(data)}`, async () => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      await expect(
        rememberAiMemory({ scope, value: 'Synthetic preference' })
      ).resolves.toMatchObject({
        ok: true,
        value: { id: 'synthetic-memory', status: 'done' },
      });
      expect(mocks.embed).toHaveBeenCalledOnce();
      expect(mocks.add).toHaveBeenCalledOnce();
    });
  }
});
