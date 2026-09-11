import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  settle: vi.fn(),
  capture: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('ai', () => ({
  gateway: { image: (id: string) => id },
  generateImage: mocks.generate,
}));
vi.mock('./public-api', () => ({
  prepareMeteredExecution: mocks.prepare,
  settleMeteredExecution: mocks.settle,
  captureAiStudioContent: mocks.capture,
  publicApiError: () => Response.json({ error: 'failed' }, { status: 503 }),
}));

import { executeImageRequest, imageRequestSchema } from './image-execution';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({ requestId: 'request', runId: 'ledger' });
  mocks.settle.mockResolvedValue({ billedCredits: 4, providerCostUsd: 0.04 });
  mocks.capture.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({
    image: { base64: 'AAAA', mediaType: 'image/png' },
  });
});
it('returns image bytes and confirmed billing while preserving first-party sponsorship', async () => {
  const credential = {
    kind: 'first-party' as const,
    appId: 'colab' as const,
    actorId: 'host',
    workspaceId: 'root',
  };
  const response = await executeImageRequest(
    new Request('https://ai.test'),
    imageRequestSchema.parse({ model: 'image-model', prompt: 'Artwork' }),
    {
      credential,
      requirePricedUsage: true,
      metadata: { workshopId: 'room' },
      feature: 'colab_run_image',
    }
  );
  expect(mocks.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      credential,
      requirePricedUsage: true,
      requiredModelType: 'image',
      metadata: expect.objectContaining({ workshopId: 'room' }),
    })
  );
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({ maxRetries: 0 })
  );
  expect(await response.json()).toMatchObject({
    data: [{ b64_json: 'AAAA', media_type: 'image/png' }],
    tuturuuu: { run_id: 'ledger', billing: { billedCredits: 4 } },
  });
});
it('does not invent a successful asset or receipt after a provider failure', async () => {
  mocks.generate.mockRejectedValue(new Error('provider unavailable'));
  const response = await executeImageRequest(
    new Request('https://ai.test'),
    imageRequestSchema.parse({ model: 'image-model', prompt: 'Artwork' })
  );
  expect(response.status).toBe(503);
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: 'failed', usage: {} })
  );
});
