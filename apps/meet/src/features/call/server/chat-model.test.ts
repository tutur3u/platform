import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = { eq: mocks.eq, single: mocks.single };
    mocks.eq.mockReturnValue(query);
    return { schema: () => ({ from: () => ({ select: () => query }) }) };
  },
}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { getMeetChatModel } from './chat-model';

const data = {
  input_price_per_token: 0.0000003,
  output_price_per_token: 0.0000025,
  cache_read_price_per_token: 0.00000003,
  input_tiers: null,
  output_tiers: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ modelId: 'google/gemini-3.5-flash-lite' });
  mocks.single.mockResolvedValue({ data, error: null });
});
it('selects the personal plan default and matching enabled model prices', async () => {
  expect(await getMeetChatModel('personal')).toMatchObject({
    id: 'google/gemini-3.5-flash-lite',
    providerModelId: 'gemini-3.5-flash-lite',
    inputPricePerToken: data.input_price_per_token,
    cacheReadPricePerToken: data.cache_read_price_per_token,
    outputPricePerToken: data.output_price_per_token,
    tieredPricing: false,
  });
  expect(mocks.resolve).toHaveBeenCalledWith({
    wsId: 'personal',
    capability: 'language',
  });
  expect(mocks.eq).toHaveBeenCalledWith('id', 'google/gemini-3.5-flash-lite');
  expect(mocks.eq).toHaveBeenCalledWith('is_enabled', true);
});
it('does not send a non-Google plan model to the Gemini provider', async () => {
  mocks.resolve.mockResolvedValue({ modelId: 'openai/gpt-5' });
  await expect(getMeetChatModel('personal')).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.single).not.toHaveBeenCalled();
});
it.each([
  { data: null, error: null },
  { data, error: new Error('unavailable') },
  { data: { ...data, input_price_per_token: -1 }, error: null },
  { data: { ...data, output_price_per_token: NaN }, error: null },
])('rejects unavailable pricing before generation', async (result) => {
  mocks.single.mockResolvedValue(result);
  await expect(getMeetChatModel('personal')).rejects.toMatchObject({
    status: 503,
  });
});
it('marks tiered catalog pricing for incomplete cost coverage', async () => {
  mocks.single.mockResolvedValue({
    data: { ...data, input_tiers: [{ min: 0, cost: '0.1' }] },
    error: null,
  });
  expect(await getMeetChatModel('personal')).toMatchObject({
    tieredPricing: true,
  });
});

it.each([-1, NaN, Infinity])(
  'retains unknown cache pricing for invalid rate %s',
  async (rate) => {
    mocks.single.mockResolvedValue({
      data: { ...data, cache_read_price_per_token: rate },
      error: null,
    });
    expect(await getMeetChatModel('personal')).toMatchObject({
      cacheReadPricePerToken: null,
    });
  }
);
