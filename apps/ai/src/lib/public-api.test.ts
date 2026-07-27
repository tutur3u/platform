import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticatePublicAiRequest: vi.fn(),
  beginAiStudioRun: vi.fn(),
  beginExternalAiStudioRun: vi.fn(),
  calculateAiStudioUsageCost: vi.fn(),
  settleAiStudioRun: vi.fn(),
  settleExternalAiStudioRun: vi.fn(),
}));

vi.mock('./public-credential', () => ({
  authenticatePublicAiRequest: mocks.authenticatePublicAiRequest,
  EXTERNAL_AI_SCOPE: 'ai:use',
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: mocks.beginAiStudioRun,
  beginExternalAiStudioRun: mocks.beginExternalAiStudioRun,
  calculateAiStudioUsageCost: mocks.calculateAiStudioUsageCost,
  settleAiStudioRun: mocks.settleAiStudioRun,
  settleExternalAiStudioRun: mocks.settleExternalAiStudioRun,
}));

import { prepareMeteredExecution, settleMeteredExecution } from './public-api';

describe('AI Studio billing policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calculateAiStudioUsageCost.mockResolvedValue({
      billedCredits: 25,
      providerCostUsd: 0.0025,
    });
    mocks.beginAiStudioRun.mockResolvedValue({ runId: 'metered-run' });
    mocks.beginExternalAiStudioRun.mockResolvedValue({
      runId: 'external-run',
    });
  });

  it('reserves workspace credits for ordinary AI API keys', async () => {
    mocks.authenticatePublicAiRequest.mockResolvedValue({
      actorId: 'actor',
      apiKey: { id: 'key' },
      kind: 'api-key',
      workspaceId: 'workspace',
    });

    const context = await prepareMeteredExecution({
      feature: 'responses',
      maxUsage: { inputTokens: 10, outputTokens: 20 },
      modelId: 'google/gemini-3.1-flash-lite',
      request: new Request('https://ai.tuturuuu.com/v1/responses'),
    });

    expect(context.runId).toBe('metered-run');
    expect(mocks.beginAiStudioRun).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key',
        reservedCredits: 25,
        workspaceId: 'workspace',
      })
    );
    expect(mocks.beginExternalAiStudioRun).not.toHaveBeenCalled();
  });

  it('audits a linked external app without reserving workspace credits', async () => {
    mocks.authenticatePublicAiRequest.mockResolvedValue({
      actorId: 'actor',
      appId: 'cybershield35',
      kind: 'external-app',
      scopes: ['ai:use', 'workspace:session'],
      workspaceId: 'workspace',
    });

    const request = new Request('https://ai.tuturuuu.com/v1/responses', {
      headers: { 'idempotency-key': 'request-1' },
    });
    const context = await prepareMeteredExecution({
      feature: 'responses',
      maxUsage: { inputTokens: 10, outputTokens: 20 },
      modelId: 'google/gemini-3.1-flash-lite',
      request,
    });

    expect(context.runId).toBe('external-run');
    expect(mocks.beginExternalAiStudioRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAppId: 'cybershield35',
        idempotencyKey: 'cybershield35:request-1',
        workspaceId: 'workspace',
      })
    );
    expect(mocks.beginAiStudioRun).not.toHaveBeenCalled();

    await settleMeteredExecution(context, {
      status: 'succeeded',
      usage: { inputTokens: 7, outputTokens: 9 },
    });

    expect(mocks.settleExternalAiStudioRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 7,
        outputTokens: 9,
        providerCostUsd: 0.0025,
        runId: 'external-run',
      })
    );
    expect(mocks.settleAiStudioRun).not.toHaveBeenCalled();
  });
});
