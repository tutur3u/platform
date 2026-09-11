import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  plan: vi.fn(),
}));
vi.mock('ai', () => ({
  generateText: mocks.generate,
}));
vi.mock('@ai-sdk/google', () => ({ google: (id: string) => id }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = { select: () => query, eq: () => query, single: mocks.plan };
    return { rpc: async () => ({ data: 'PRO' }), from: () => query };
  },
}));

import {
  createGeminiImageBilling,
  creditsForProviderCost,
  GEMINI_FLASH_IMAGE,
  isGeminiFlashImage,
  priceGoogleImageUsage,
} from './gemini-image';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue({ data: { markup_multiplier: 1 } });
  mocks.generate.mockResolvedValue({
    usage: {
      inputTokens: 100,
      outputTokens: 1200,
      outputTokenDetails: { reasoningTokens: 80 },
    },
    files: [{ base64: 'AAAA', mediaType: 'image/png' }],
    response: { id: 'google_response_test' },
    providerMetadata: {
      google: {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 1120,
          thoughtsTokenCount: 80,
          candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }],
        },
      },
    },
  });
});

it('accepts only the deliberately supported multimodal model', () => {
  expect(isGeminiFlashImage(GEMINI_FLASH_IMAGE)).toBe(true);
  expect(isGeminiFlashImage('google/gemini-3.6-flash')).toBe(false);
  expect(isGeminiFlashImage('google/gemini-3.1-flash-image-preview')).toBe(
    false
  );
});
it('reserves conservatively but settles modality-priced Google usage', async () => {
  const billing = createGeminiImageBilling('Artwork', 1);
  const reserve = await billing.calculateCost({ imageUnits: 1 }, 'root');
  expect(reserve.providerCostUsd).toBeGreaterThan(0.25);
  const request = new Request('https://ai.test');
  expect(await billing.generate(request, '3:2')).toMatchObject({
    image: { base64: 'AAAA' },
  });
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gemini-3.1-flash-image',
      abortSignal: request.signal,
      maxRetries: 0,
      providerOptions: {
        google: {
          responseModalities: ['IMAGE'],
          imageConfig: { imageSize: '1K', aspectRatio: '3:2' },
        },
      },
    })
  );
  expect(billing.usage).toEqual({
    inputTokens: 100,
    outputTokens: 1200,
    reasoningTokens: 80,
    imageUnits: 1,
  });
  const cost = await billing.calculateCost(billing.usage, 'root');
  expect(cost.providerCostUsd).toBe(0.06749);
  expect(cost.billedCredits).toBeCloseTo(674.9, 8);
});
it('applies the actual plan markup and rejects invalid costs', () => {
  expect(creditsForProviderCost(0.04, 2).billedCredits).toBe(800);
  expect(creditsForProviderCost(0, 1).billedCredits).toBe(0);
  expect(() => creditsForProviderCost(Number.NaN, 1)).toThrow();
  expect(() => creditsForProviderCost(-1, 1)).toThrow();
  expect(() => creditsForProviderCost(1, 0)).toThrow();
});
it('preserves measured usage for reconciliation when the provider receipt is unavailable', async () => {
  const billing = createGeminiImageBilling('Artwork', 1);
  const result = await mocks.generate();
  result.providerMetadata.google.usageMetadata.candidatesTokensDetails = [];
  mocks.generate.mockResolvedValue(result);
  await expect(
    billing.generate(new Request('https://ai.test'), '1:1')
  ).rejects.toThrow('Image modality pricing');
  expect(billing.usage.imageUnits).toBe(1);
  await expect(billing.calculateCost(billing.usage, 'root')).rejects.toThrow(
    'Image modality pricing'
  );
});
it('retains partial paid usage when a later image fails', async () => {
  const billing = createGeminiImageBilling('Artwork', 2);
  await billing.generate(new Request('https://ai.test'), '1:1');
  mocks.generate.mockRejectedValue(new Error('Provider unavailable'));
  await expect(
    billing.generate(new Request('https://ai.test'), '1:1')
  ).rejects.toThrow();
  expect(
    (await billing.calculateCost(billing.usage, 'root')).billedCredits
  ).toBeCloseTo(674.9, 8);
});
it('charges a measured safety refusal without inventing an image', async () => {
  mocks.generate.mockResolvedValue({
    usage: { inputTokens: 100, outputTokens: 3, outputTokenDetails: {} },
    files: [],
    response: { id: 'google_response_test' },
    providerMetadata: {
      google: {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 3,
          candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 3 }],
        },
      },
    },
  });
  const billing = createGeminiImageBilling('Artwork', 1);
  await expect(
    billing.generate(new Request('https://ai.test'), '1:1')
  ).rejects.toThrow('exactly one image');
  expect(billing.usage.imageUnits).toBe(0);
  expect(
    (await billing.calculateCost(billing.usage, 'root')).providerCostUsd
  ).toBeGreaterThan(0);
});
it('fails closed on cached or unsupported modality usage instead of guessing charges', () => {
  expect(() =>
    priceGoogleImageUsage(
      {
        promptTokenCount: 10,
        candidatesTokenCount: 1119,
        candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }],
      },
      1
    )
  ).toThrow('complete uncached usage');
  expect(() =>
    priceGoogleImageUsage(
      { promptTokenCount: 10, cachedContentTokenCount: 5 },
      0
    )
  ).toThrow();
  expect(() =>
    priceGoogleImageUsage(
      {
        promptTokenCount: 10,
        candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 1 }],
      },
      0
    )
  ).toThrow();
  expect(() => priceGoogleImageUsage(undefined, 1)).toThrow();
});
it('retains image receipts when optional SDK reasoning details are absent', async () => {
  const result = await mocks.generate();
  delete result.usage.outputTokenDetails;
  mocks.generate.mockResolvedValue(result);
  const billing = createGeminiImageBilling('Artwork', 1);
  await billing.generate(new Request('https://ai.test'), '1:1');
  expect(billing.usage).toMatchObject({ reasoningTokens: 0, imageUnits: 1 });
  expect(
    (await billing.calculateCost(billing.usage, 'root')).providerCostUsd
  ).toBe(0.06749);
});
