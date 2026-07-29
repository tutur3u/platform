import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

describe('AI Studio usage aggregation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const privateClient = { rpc: mocks.rpc };
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: { schema: vi.fn().mockReturnValue(privateClient) },
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
  });

  it('keeps external provider cost separate from billed credits', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          aborted_count: 1,
          average_latency_ms: '250',
          billed_credits: '0',
          bucket_date: '2026-07-28',
          embedding_units: 0,
          failed_count: 1,
          feature: 'speech',
          image_units: 0,
          input_tokens: 12,
          latency_sample_count: 2,
          model_id: 'google/gemini-tts',
          output_tokens: 30,
          provider_cost_usd: '0.0042',
          reasoning_tokens: 0,
          request_count: 2,
          search_units: 0,
          source_id: 'external-app-1',
          source_type: 'external_app',
          succeeded_count: 0,
        },
      ],
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'https://ai.example/usage?from=2026-07-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        totals: expect.objectContaining({
          abortedCount: 1,
          billedCredits: 0,
          failedCount: 1,
          providerCostUsd: 0.0042,
          requestCount: 2,
        }),
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_ai_studio_consumption_breakdown',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      })
    );
  });

  it('includes settled workspace credit activity and weights only latency samples', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          aborted_count: 0,
          average_latency_ms: '200',
          billed_credits: '2.5',
          bucket_date: '2026-07-28',
          embedding_units: 0,
          failed_count: 0,
          feature: 'chat',
          image_units: 0,
          input_tokens: 100,
          latency_sample_count: 1,
          model_id: 'openai/gpt-5-mini',
          output_tokens: 20,
          provider_cost_usd: '0.001',
          reasoning_tokens: 5,
          request_count: 1,
          search_units: 2,
          source_id: 'user-1',
          source_type: 'workspace_credit',
          succeeded_count: 1,
        },
        {
          aborted_count: 0,
          average_latency_ms: '0',
          billed_credits: '7.5',
          bucket_date: '2026-07-28',
          embedding_units: 0,
          failed_count: 0,
          feature: 'image',
          image_units: 1,
          input_tokens: 0,
          latency_sample_count: 0,
          model_id: 'openai/gpt-image-1',
          output_tokens: 0,
          provider_cost_usd: '0.02',
          reasoning_tokens: 0,
          request_count: 1,
          search_units: 0,
          source_id: 'user-1',
          source_type: 'workspace_credit',
          succeeded_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'https://ai.example/usage?from=2026-07-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        totals: expect.objectContaining({
          averageLatencyMs: 200,
          billedCredits: 10,
          latencySampleCount: 1,
          searchUnits: 2,
        }),
      })
    );
  });

  it('rejects an overlong range before querying the database', async () => {
    const response = await GET(
      new NextRequest(
        'https://ai.example/usage?from=2024-01-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
