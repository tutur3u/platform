import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  settle: vi.fn(),
  capture: vi.fn(),
  generate: vi.fn(),
  error: vi.fn(),
}));
vi.mock('ai', () => ({
  gateway: { image: (id: string) => id },
  generateImage: mocks.generate,
}));
vi.mock('./public-api', () => ({
  prepareMeteredExecution: mocks.prepare,
  settleMeteredExecution: mocks.settle,
  captureAiStudioContent: mocks.capture,
  publicApiError: mocks.error,
}));

import { executeImageRequest, imageRequestSchema } from './image-execution';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({ requestId: 'request', runId: 'ledger' });
  mocks.settle.mockResolvedValue({ billedCredits: 4, providerCostUsd: 0.04 });
  mocks.capture.mockResolvedValue(undefined);
  mocks.error.mockImplementation(() =>
    Response.json({ error: 'failed' }, { status: 503 })
  );
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
  const request = new Request('https://ai.test');
  const response = await executeImageRequest(
    request,
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
    expect.objectContaining({ maxRetries: 0, abortSignal: request.signal })
  );
  expect(mocks.capture).toHaveBeenCalled();
  expect(await response.json()).toMatchObject({
    data: [{ b64_json: 'AAAA', media_type: 'image/png' }],
    tuturuuu: { run_id: 'ledger', billing: { billedCredits: 4 } },
  });
});
it('classifies retired gateway models so Colab can stop retrying artwork', async () => {
  const error = new Error('Unavailable model');
  error.name = 'GatewayModelNotFoundError';
  mocks.generate.mockRejectedValue(error);
  await executeImageRequest(
    new Request('https://ai.test'),
    imageRequestSchema.parse({
      model: 'retired-image-model',
      prompt: 'Artwork',
    })
  );
  expect(mocks.error).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'model_not_found', status: 404 }),
    'request'
  );
});
it('does not invent a successful asset or receipt after a provider failure', async () => {
  mocks.generate.mockRejectedValue(new Error('provider unavailable'));
  const response = await executeImageRequest(
    new Request('https://ai.test'),
    imageRequestSchema.parse({ model: 'image-model', prompt: 'Artwork' })
  );
  expect(response.status).toBe(503);
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: 'failed', usage: { imageUnits: 0 } })
  );
});
it('retains paid non-Gemini image usage when a subsequent generation fails', async () => {
  mocks.generate.mockResolvedValueOnce({
    image: { base64: 'AAAA', mediaType: 'image/png' },
  });
  mocks.generate.mockRejectedValueOnce(new Error('provider unavailable'));
  const response = await executeImageRequest(
    new Request('https://ai.test'),
    imageRequestSchema.parse({ model: 'image-model', prompt: 'Artwork', n: 2 })
  );
  expect(response.status).toBe(503);
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: 'failed',
      usage: { imageUnits: 1 },
    })
  );
});
