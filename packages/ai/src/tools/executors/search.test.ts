import { beforeEach, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeGoogleSearch } from './search';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  generate: vi.fn(),
  googleModel: vi.fn(() => ({})),
  release: vi.fn(),
  reserveNestedModelBudget: vi.fn(),
  resolvePlanModel: vi.fn(),
  settle: vi.fn(),
}));
vi.mock('ai', () => ({
  generateText: mocks.generate,
  stepCountIs: vi.fn(),
}));
vi.mock('@ai-sdk/google', () => ({
  google: Object.assign(mocks.googleModel, {
    tools: { googleSearch: () => ({}) },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../credits/resolve-plan-model', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../credits/resolve-plan-model')
  >()),
  resolvePlanModel: mocks.resolvePlanModel,
}));
vi.mock('../../credits/nested-budget', () => ({
  reserveNestedModelBudget: mocks.reserveNestedModelBudget,
}));
vi.mock('../../memory', () => ({ withAiMemory: async () => ({}) }));

const ctx = {
  creditWsId: 'billing-workspace',
  userId: 'user',
  wsId: 'workspace',
} as MiraToolContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockResolvedValue({ admin: true });
  mocks.resolvePlanModel.mockResolvedValue({
    allocationId: 'alloc-1',
    modelId: 'google/gemini-3.5-flash-lite',
    source: 'requested',
    tier: 'FREE',
  });
  mocks.settle.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.reserveNestedModelBudget.mockResolvedValue({
    ok: true,
    reservationId: 'search-res-1',
    heldCredits: 20,
    perAttemptMaxOutputTokens: 512,
    settle: mocks.settle,
    release: mocks.release,
  });
});

it('recognizes native server search completion without repeating the search', async () => {
  mocks.generate.mockResolvedValue({
    text: 'Search completed',
    sources: [],
    steps: [{ toolResults: [{ toolName: 'server:GOOGLE_SEARCH_WEB' }] }],
    totalUsage: { inputTokens: 20, outputTokens: 15 },
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: true });
  expect(mocks.resolvePlanModel).toHaveBeenCalledWith({
    capability: 'language',
    requestedModel: 'gemini-3.5-flash-lite',
    wsId: 'billing-workspace',
  });
  expect(mocks.reserveNestedModelBudget).toHaveBeenCalledWith(
    expect.objectContaining({
      attemptCount: 2,
      estimatedSearchCount: 4,
      wsId: 'billing-workspace',
    })
  );
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({ maxOutputTokens: 512 })
  );
  expect(mocks.settle).toHaveBeenCalledWith({
    inputTokens: 20,
    outputTokens: 15,
    reasoningTokens: 0,
    searchCount: 1,
  });
  expect(mocks.googleModel).toHaveBeenCalledWith('gemini-3.5-flash-lite');
  expect(mocks.generate).toHaveBeenCalledOnce();
});

it('fails closed without invoking the search wrapper when budget reservation fails', async () => {
  mocks.reserveNestedModelBudget.mockResolvedValueOnce({
    ok: false,
    code: 'CREDITS_EXHAUSTED',
    status: 403,
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: false });
  expect(mocks.generate).not.toHaveBeenCalled();

  mocks.reserveNestedModelBudget.mockResolvedValueOnce({
    ok: false,
    code: 'CREDIT_CHECK_FAILED',
    status: 503,
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: false });
  expect(mocks.generate).not.toHaveBeenCalled();
});

it.each(['response', 'step'])(
  'accepts %s grounding metadata without explicit search-call events',
  async (location) => {
    const providerMetadata = {
      google: {
        groundingMetadata: { webSearchQueries: ['Calendar sharing help'] },
      },
    };
    mocks.generate.mockResolvedValue({
      text: 'Calendar sharing help',
      ...(location === 'response' ? { providerMetadata } : {}),
      sources: [
        {
          url: 'https://support.google.com/calendar/answer/37082',
          title: 'Share your calendar',
        },
      ],
      steps: location === 'step' ? [{ providerMetadata }] : [],
    });
    expect(
      await executeGoogleSearch({ query: 'Calendar sharing help' }, ctx)
    ).toMatchObject({ ok: true, sourceCount: 1 });
    expect(mocks.generate).toHaveBeenCalledOnce();
  }
);

it('does not claim web grounding from arbitrary sources alone and suppresses retry after a counted search unit', async () => {
  mocks.generate.mockResolvedValue({
    text: 'Unverified',
    sources: [{ title: 'A source' }],
    steps: [],
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: false });
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.objectContaining({ searchCount: 1 })
  );
});

it('keeps native search automatic on the grounding retry', async () => {
  mocks.generate.mockResolvedValue({
    text: 'Unverified',
    sources: [],
    steps: [],
  });
  await executeGoogleSearch({ query: 'Calendar help' }, ctx);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  for (const [request] of mocks.generate.mock.calls)
    expect(request.toolChoice).toBe('auto');
});

it('does not report success when native search produces no answer', async () => {
  mocks.generate.mockResolvedValue({
    text: '',
    sources: [],
    steps: [{ toolResults: [{ toolName: 'server:GOOGLE_SEARCH_WEB' }] }],
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: false });
  expect(mocks.generate).toHaveBeenCalledOnce();
});
