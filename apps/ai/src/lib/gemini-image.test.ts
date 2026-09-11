import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  receipt: vi.fn(),
  plan: vi.fn(),
}));
vi.mock('ai', () => ({
  gateway: Object.assign((id: string) => id, {
    getGenerationInfo: mocks.receipt,
  }),
  generateText: mocks.generate,
}));
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
    providerMetadata: { gateway: { generationId: 'gen_test' } },
  });
  mocks.receipt.mockResolvedValue({
    model: GEMINI_FLASH_IMAGE,
    totalCost: 0.06749,
    isByok: false,
  });
});

it('accepts only the deliberately supported multimodal model', () => {
  expect(isGeminiFlashImage(GEMINI_FLASH_IMAGE)).toBe(true);
  expect(isGeminiFlashImage('google/gemini-3.6-flash')).toBe(false);
  expect(isGeminiFlashImage('google/gemini-3.1-flash-image-preview')).toBe(
    false
  );
});
it('reserves conservatively but settles exact gateway cost including image tokens', async () => {
  const billing = createGeminiImageBilling('Artwork', 1);
  const reserve = await billing.calculateCost({ imageUnits: 1 }, 'root');
  expect(reserve.providerCostUsd).toBeGreaterThan(0.25);
  const request = new Request('https://ai.test');
  expect(await billing.generate(request, '3:2')).toMatchObject({
    image: { base64: 'AAAA' },
  });
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: GEMINI_FLASH_IMAGE,
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
  mocks.receipt.mockRejectedValue(new Error('Receipt unavailable'));
  await expect(
    billing.generate(new Request('https://ai.test'), '1:1')
  ).rejects.toThrow('Receipt unavailable');
  expect(billing.usage.imageUnits).toBe(1);
  await expect(billing.calculateCost(billing.usage, 'root')).rejects.toThrow(
    'Receipt unavailable'
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
    providerMetadata: { gateway: { generationId: 'gen_test' } },
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
